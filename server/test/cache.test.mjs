import test from 'node:test';
import assert from 'node:assert/strict';
import { CatalogCache } from '../cache.mjs';

class MemoryRedis {
  data = new Map();
  offline = false;
  ready() { if (this.offline) throw new Error('offline'); }
  async ping() { this.ready(); return 'PONG'; }
  async hgetall(key) { this.ready(); return { ...this.data.get(key) }; }
  async hset(key, values) { this.ready(); this.data.set(key, { ...this.data.get(key), ...values }); }
  async expire() { this.ready(); }
  async rename(from, to) { this.ready(); this.data.set(to, this.data.get(from)); this.data.delete(from); }
  async del(...keys) { this.ready(); keys.forEach(key => this.data.delete(key)); }
  async scan() { this.ready(); return ['0', [...this.data.keys()].filter(k => k.includes('reviews:'))]; }
  async eval(_script, _count, ...args) {
    this.ready();
    const [key1, key2, id1, value1, id2, value2] = args;
    for (const [key, id, value] of [[key1, id1, value1], [key2, id2, value2]]) {
      const hash = this.data.get(key);
      if (!hash?.__meta) continue;
      if (value) hash[id] = value;
      else delete hash[id];
    }
  }
}
function setup() {
  const redis = new MemoryRedis();
  let teachers = [{ id: 't', review_count: 1 }];
  let reviews = [{ id: 'r', teacher_id: 't', status: 'approved', likes: 1 }];
  let fullTeacherReads = 0;
  let reviewReads = 0;
  const source = {
    async teachers() { fullTeacherReads++; return structuredClone(teachers); },
    async teacher(id) { return structuredClone(teachers.find(t => t.id === id) || null); },
    async reviews() { reviewReads++; return structuredClone(reviews); },
    async review(id) { return structuredClone(reviews.find(r => r.id === id) || null); },
  };
  const cache = new CatalogCache(redis, source, { logger: { warn() {}, info() {} } });
  return { cache, redis, source, setTeachers: rows => { teachers = rows; }, setReviews: rows => { reviews = rows; }, counts: () => ({ fullTeacherReads, reviewReads }) };
}

test('term snapshots refresh after a term switch and cold timetable loads coalesce or bypass Redis', async () => {
  const s = setup();
  let termId = 'first';
  let reads = 0;
  s.source.terms = async () => [{ id: termId, is_current: true, year_term: termId }];
  s.source.timetable = async id => { reads++; return [{ id: `section-${id}`, termId: id, meetings: [{ id: 'm' }] }]; };
  await s.cache.synchronize();
  assert.equal((await s.cache.terms()).rows[0].id, 'first');
  const meta = JSON.parse(s.redis.data.get(s.cache.timetableKey('first')).__meta);
  assert.equal(meta.sectionCount, 1);
  assert.equal(meta.meetingCount, 1);
  termId = 'second';
  await s.cache.synchronize();
  assert.equal((await s.cache.terms()).rows[0].id, 'second');
  assert.equal((await s.cache.timetable('second')).rows[0].termId, 'second');
  reads = 0;
  await s.redis.del(s.cache.timetableKey('second'));
  await Promise.all([s.cache.timetable('second'), s.cache.timetable('second')]);
  assert.equal(reads, 1);
  s.redis.offline = true;
  assert.equal((await s.cache.timetable('second')).cache, 'BYPASS');
  s.redis.offline = false;
  await s.cache.synchronize();
  assert.equal((await s.cache.timetable('second')).cache, 'HIT');
});
test('cache coalesces cold loads and patches one review without a full download', async () => {
  const s = setup();
  await Promise.all([s.cache.teachers(), s.cache.teachers()]);
  await s.cache.reviews('t');
  assert.deepEqual(s.counts(), { fullTeacherReads: 1, reviewReads: 1 });
  s.setTeachers([{ id: 't', review_count: 2 }]);
  s.setReviews([{ id: 'r', teacher_id: 't', likes: 2 }, { id: 'new', teacher_id: 't', likes: 0 }]);
  await s.cache.mutate(() => s.cache.changedReview('t', 'new'));
  assert.equal((await s.cache.reviews('t')).rows.length, 2);
  assert.equal((await s.cache.teachers()).rows[0].review_count, 2);
  assert.deepEqual(s.counts(), { fullTeacherReads: 1, reviewReads: 1 });
});
test('incremental updates never create a partial review group or teacher catalog after eviction', async () => {
  const s = setup();
  await s.cache.changedReview('t', 'r');
  assert.equal(s.redis.data.has(s.cache.reviewKey('t')), false);
  assert.equal(s.redis.data.has(s.cache.teacherKey), false);
  assert.equal((await s.cache.reviews('t')).cache, 'MISS');
});
test('removed public reviews disappear and likes update without a teacher catalog download', async () => {
  const s = setup();
  await s.cache.reviews('t');
  s.setReviews([{ id: 'r', teacher_id: 't', likes: 9 }]);
  await s.cache.changedReview('t', 'r', { teacherChanged: false });
  assert.equal((await s.cache.reviews('t')).rows[0].likes, 9);
  s.setReviews([]);
  await s.cache.changedReview('t', 'r');
  assert.equal((await s.cache.reviews('t')).rows.length, 0);
  assert.equal(s.counts().fullTeacherReads, 0);
});
test('failed refresh bypasses stale content, and successful synchronization restores cache reads', async () => {
  const s = setup();
  await s.cache.teachers();
  await s.cache.reviews('t');
  s.redis.offline = true;
  s.setReviews([]);
  await s.cache.changedReview('t', 'r');
  s.redis.offline = false;
  const result = await s.cache.reviews('t');
  assert.equal(result.cache, 'BYPASS');
  assert.equal(result.rows.length, 0);
  await s.cache.synchronize();
  assert.equal((await s.cache.reviews('t')).cache, 'HIT');
  assert.equal((await s.cache.reviews('t')).rows.length, 0);
});
test('full synchronization and DB mutations serialize so old snapshots cannot overwrite newer writes', async () => {
  const s = setup();
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const original = s.source.teachers;
  s.source.teachers = async () => { const rows = await original(); await barrier; return rows; };
  const refresh = s.cache.synchronize();
  const mutation = s.cache.mutate(async () => {
    s.setTeachers([{ id: 't', review_count: 99 }]);
    await s.cache.changedReview('t', 'r');
  });
  release();
  await Promise.all([refresh, mutation]);
  assert.equal((await s.cache.teachers()).rows[0].review_count, 99);
});
test('overlapping scheduled synchronizations share one pass', async () => {
  const s = setup();
  await Promise.all([s.cache.synchronize(), s.cache.synchronize()]);
  assert.equal(s.counts().fullTeacherReads, 1);
});
test('calibration allows pending writes between cached review groups', async () => {
  const s = setup();
  await s.cache.reviews('t');
  await s.cache.reviews('t2');
  let release, started;
  const barrier = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { started = resolve; });
  const order = [];
  s.source.reviews = async id => {
    order.push(id);
    if (id === 't') { started(); await barrier; }
    return [];
  };
  const sync = s.cache.synchronize();
  await ready;
  const mutation = s.cache.mutate(async () => { order.push('mutation'); });
  release();
  await Promise.all([sync, mutation]);
  assert.deepEqual(order, ['t', 'mutation', 't2']);
});
