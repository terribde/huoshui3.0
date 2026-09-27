import { randomUUID } from 'node:crypto';

const PATCH = `
if redis.call('HEXISTS', KEYS[1], '__meta') == 1 then
  if ARGV[2] == '' then redis.call('HDEL', KEYS[1], ARGV[1])
  else redis.call('HSET', KEYS[1], ARGV[1], ARGV[2]) end
end
if redis.call('HEXISTS', KEYS[2], '__meta') == 1 then
  if ARGV[4] == '' then redis.call('HDEL', KEYS[2], ARGV[3])
  else redis.call('HSET', KEYS[2], ARGV[3], ARGV[4]) end
end
return 1`;

export class CatalogCache {
  constructor(redis, source, { prefix = 'swjtu:prod:cache:v1:', ttl = 604800, logger = console } = {}) {
    this.redis = redis;
    this.source = source;
    this.prefix = prefix;
    this.ttl = ttl;
    this.logger = logger;
    this.available = true;
    this.tail = Promise.resolve();
    this.flights = new Map();
    this.lastSync = 0;
  }
  get teacherKey() { return `${this.prefix}teachers`; }
  reviewKey(id) { return `${this.prefix}reviews:${id}`; }
  exclusive(operation) {
    const next = this.tail.then(operation, operation);
    this.tail = next.catch(() => {});
    return next;
  }
  failure(error) {
    if (this.available) this.logger.warn('[cache] bypass enabled:', error.message);
    this.available = false;
  }
  async snapshot(key) {
    if (!this.available) return null;
    try {
      const fields = await this.redis.hgetall(key);
      if (!fields.__meta) return null;
      return Object.entries(fields).filter(([id]) => id !== '__meta').map(([, value]) => JSON.parse(value));
    } catch (error) { this.failure(error); return null; }
  }
  async publish(key, rows) {
    const temporary = `${this.prefix}staging:${randomUUID()}`;
    const values = { __meta: JSON.stringify({ refreshedAt: Date.now() }) };
    for (const row of rows) values[row.id] = JSON.stringify(row);
    try {
      await this.redis.hset(temporary, values);
      await this.redis.expire(temporary, this.ttl);
      await this.redis.rename(temporary, key);
    } catch (error) {
      await this.redis.del(temporary).catch(() => {});
      throw error;
    }
  }
  async load(key, loader) {
    const cached = await this.snapshot(key);
    if (cached) return { rows: cached, cache: 'HIT' };
    if (!this.flights.has(key)) {
      const flight = this.exclusive(async () => {
        const existing = await this.snapshot(key);
        if (existing) return { rows: existing, cache: 'HIT' };
        const rows = await loader();
        if (this.available) {
          try { await this.publish(key, rows); }
          catch (error) { this.failure(error); }
        }
        return { rows, cache: this.available ? 'MISS' : 'BYPASS' };
      }).finally(() => this.flights.delete(key));
      this.flights.set(key, flight);
    }
    return this.flights.get(key);
  }
  teachers() { return this.load(this.teacherKey, () => this.source.teachers()); }
  reviews(id) { return this.load(this.reviewKey(id), () => this.source.reviews(id)); }

  // The DB write and cache refresh share the queue with full snapshot refreshes.
  mutate(operation) { return this.exclusive(operation); }
  async changedReview(teacherId, reviewId, { teacherChanged = true } = {}) {
    try {
      const [teacher, review] = await Promise.all([
        teacherChanged ? this.source.teacher(teacherId) : Promise.resolve(undefined),
        this.source.review(reviewId),
      ]);
      if (!this.available) return;
      if (teacherChanged) {
        await this.redis.eval(PATCH, 2, this.teacherKey, this.reviewKey(teacherId),
          teacherId, teacher ? JSON.stringify(teacher) : '', reviewId, review ? JSON.stringify(review) : '');
      } else {
        await this.redis.eval(PATCH, 2, this.reviewKey(teacherId), this.reviewKey(teacherId),
          reviewId, review ? JSON.stringify(review) : '', reviewId, review ? JSON.stringify(review) : '');
      }
    } catch (error) {
      this.failure(error);
      await this.redis.del(this.teacherKey, this.reviewKey(teacherId)).catch(() => {});
    }
  }
  synchronize() {
    if (this.syncFlight) return this.syncFlight;
    this.syncFlight = (async () => {
      try {
        await this.redis.ping();
        const teacherRows = await this.exclusive(async () => {
          const rows = await this.source.teachers();
          await this.publish(this.teacherKey, rows);
          return rows;
        });
        const reviewKeys = [];
        let cursor = '0';
        do {
          const result = await this.redis.scan(cursor, 'MATCH', `${this.prefix}reviews:*`, 'COUNT', 100);
          cursor = result[0];
          reviewKeys.push(...result[1]);
        } while (cursor !== '0');
        for (const key of new Set(reviewKeys)) {
          const id = key.slice(`${this.prefix}reviews:`.length);
          // Let pending writes run between review groups during a long calibration.
          await this.exclusive(async () => this.publish(key, await this.source.reviews(id)));
        }
        this.available = true;
        this.lastSync = Date.now();
        this.logger.info(`[cache] synchronized ${teacherRows.length} teachers, ${new Set(reviewKeys).size} review groups`);
      } catch (error) { this.failure(error); throw error; }
    })().finally(() => { this.syncFlight = null; });
    return this.syncFlight;
  }
}
