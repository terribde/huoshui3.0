import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failure = (status, message) => Object.assign(new Error(message), { status });
const range = days => { if (![7, 14, 30, 90].includes(days)) throw failure(400, 'Invalid analytics range'); };
export function createVisitStore(DatabaseSync, { path, timeZone = 'Asia/Tokyo', now = Date.now }) {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000;');
  db.exec('CREATE TABLE IF NOT EXISTS visit_meta (id INTEGER PRIMARY KEY CHECK(id=1), timezone TEXT NOT NULL, generation TEXT NOT NULL);' +
    'CREATE TABLE IF NOT EXISTS visits (event_id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, day TEXT NOT NULL, occurred_at INTEGER NOT NULL);' +
    'CREATE INDEX IF NOT EXISTS visits_day ON visits(day); CREATE INDEX IF NOT EXISTS visits_browser_time ON visits(visitor_id, occurred_at DESC);');
  db.prepare('INSERT OR IGNORE INTO visit_meta VALUES (1, ?, ?)').run(timeZone, randomUUID());
  const meta = db.prepare('SELECT * FROM visit_meta WHERE id=1').get();
  if (meta.timezone !== timeZone) { db.close(); throw new Error('ANALYTICS_TIMEZONE differs from the existing statistics database'); }
  const recent = db.prepare('SELECT 1 FROM visits WHERE visitor_id=? AND occurred_at>? LIMIT 1');
  const insert = db.prepare('INSERT OR IGNORE INTO visits VALUES (?, ?, ?, ?)');
  return {
    timeZone, generation: meta.generation,
    record({ eventId, visitorId }) {
      if (typeof eventId !== 'string' || typeof visitorId !== 'string' || !uuid.test(eventId) || !uuid.test(visitorId)) throw failure(400, 'Invalid visit');
      eventId = eventId.toLowerCase(); visitorId = visitorId.toLowerCase();
      const timestamp = now();
      db.exec('BEGIN IMMEDIATE');
      try {
        const accepted = !recent.get(visitorId, timestamp - 5000)
          && insert.run(eventId, visitorId, format.format(timestamp), timestamp).changes === 1;
        db.exec('COMMIT'); return Boolean(accepted);
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    overview(days) {
      range(days);
      const today = format.format(now());
      const start = new Date(today + 'T12:00:00Z'); start.setUTCDate(start.getUTCDate() - days + 1);
      const first = start.toISOString().slice(0, 10);
      // One read transaction keeps concurrent processes from producing mismatched totals.
      db.exec('BEGIN');
      try {
        const totals = db.prepare('SELECT count(*) AS total, min(occurred_at) AS first FROM visits').get();
        const period = db.prepare('SELECT count(*) AS views, count(DISTINCT visitor_id) AS visitors FROM visits WHERE day BETWEEN ? AND ?').get(first, today);
        const dailyRows = db.prepare('SELECT day, count(*) AS views, count(DISTINCT visitor_id) AS visitors FROM visits WHERE day BETWEEN ? AND ? GROUP BY day').all(first, today);
        const byDay = new Map(dailyRows.map(row => [row.day, row]));
        const daily = Array.from({ length: days }, (_, i) => {
          const date = new Date(start); date.setUTCDate(start.getUTCDate() + i);
          const key = date.toISOString().slice(0, 10); const row = byDay.get(key);
          return { date: key, views: row?.views || 0, visitors: row?.visitors || 0 };
        });
        db.exec('COMMIT');
        return { timeZone, totalViews: totals.total, firstEventAt: totals.first === null ? null : new Date(totals.first).toISOString(),
          periodViews: period.views, periodVisitors: period.visitors, todayViews: daily.at(-1).views, todayVisitors: daily.at(-1).visitors, daily };
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close() { db.close(); },
  };
}

export function createAnalytics({ store, redis, prefix = 'swjtu:prod:cache:v1:', now = Date.now }) {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: store.timeZone });
  return {
    timeZone: store.timeZone,
    record: event => store.record(event),
    async overview(days, timeZone) {
      range(days);
      if (timeZone !== store.timeZone) throw failure(400, 'Console and server analytics timezones must match');
      const key = prefix + 'analytics:' + store.generation + ':' + days + ':' + format.format(now());
      try {
        const cached = await redis.hgetall(key);
        if (cached.value && now() - Number(cached.at) >= 0 && now() - Number(cached.at) < 15000) return JSON.parse(cached.value);
      } catch { /* Redis is a disposable cache, SQLite is authoritative. */ }
      const result = store.overview(days);
      try { await redis.hset(key, { value: JSON.stringify(result), at: String(now()) }); await redis.expire(key, 15); }
      catch { /* Visits and reads keep working while Redis is unavailable. */ }
      return result;
    },
  };
}

export function mountAnalytics(app, { analytics, readToken = '', origins = [], now = Date.now }) {
  if (!analytics) return;
  if (readToken.length < 32 || !origins.length) throw new Error('Configure ANALYTICS_READ_TOKEN (32+ chars) and ANALYTICS_ALLOWED_ORIGINS');
  for (const origin of origins) if (new URL(origin).origin !== origin) throw new Error('Invalid analytics origin');
  const expected = Buffer.from('Bearer ' + readToken);
  const buckets = new Map(); let windowStart = now(); let total = 0;
  const guard = (req, res, next) => {
    try {
      if (!req.is('application/json') || !origins.includes(req.headers.origin) || req.headers['sec-fetch-site'] === 'cross-site') throw failure(403, 'Same-origin JSON requests required');
      if (now() - windowStart >= 60000) { buckets.clear(); total = 0; windowStart = now(); }
      // Trust the IP inserted by the local Nginx proxy only; never arbitrary X-Forwarded-For.
      const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      const ip = loopback ? String(req.headers['x-real-ip'] || req.socket.remoteAddress) : req.socket.remoteAddress;
      const count = buckets.get(ip) || 0;
      if (count >= 240 || total >= 6000) { res.set('Retry-After', '60'); throw failure(429, 'Too many visits'); }
      total++; buckets.set(ip, count + 1);
      next();
    } catch (error) { next(error); }
  };
  app.post('/api/analytics/visit', guard, (req, res, next) => {
    try { analytics.record(req.body); res.status(204).end(); } catch (error) { next(error); }
  });
  app.get('/api/analytics/overview', (req, res, next) => {
    const supplied = Buffer.from(req.headers.authorization || '');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return res.status(401).json({ message: 'Analytics credentials required' });
    if (typeof req.query.days !== 'string' || !['7', '14', '30', '90'].includes(req.query.days)
      || typeof req.query.timeZone !== 'string') return res.status(400).json({ message: 'Invalid analytics query' });
    Promise.resolve().then(() => analytics.overview(Number(req.query.days), req.query.timeZone)).then(data => res.json({ data }), next);
  });
}
