import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { CatalogCache } from '../cache.mjs';

const base = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:3001';
const headers = process.env.VERIFY_HOST ? { Host: process.env.VERIFY_HOST } : {};
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const get = async path => {
  const start = performance.now();
  const response = await fetch(base + path, { headers });
  assert.equal(response.status, 200, path);
  return { data: (await response.json()).data, cache: response.headers.get('x-cache'), ms: Math.round(performance.now() - start) };
};
const first = await get('/api/teachers');
assert.ok(first.data.total > 1000);
assert.equal(first.data.items.length, 20);
assert.equal(first.cache, 'HIT');
for (const page of [0, 1]) {
  const cached = await get(`/api/teachers?page=${page}`);
  const direct = await db.from('teachers').select('id', { count: 'exact' })
    .order('overall_score', { ascending: false, nullsFirst: false }).order('review_count', { ascending: false }).order('id')
    .range(page * 20, page * 20 + 19);
  assert.ifError(direct.error);
  assert.equal(cached.data.total, direct.count);
  assert.deepEqual(cached.data.items.map(row => row.id), direct.data.map(row => row.id));
}
const course = await get('/api/teachers?' + new URLSearchParams({ query: '概率论' }));
assert.ok(course.data.total > 20);
const current = await get('/api/teachers?onlyThisTerm=true');
const directCurrent = await db.from('teachers').select('id,current_offerings:course_offerings!inner(terms!inner())', { count: 'exact', head: true }).eq('current_offerings.terms.is_current', true);
assert.ifError(directCurrent.error);
assert.equal(current.data.total, directCurrent.count);
const search = await get('/api/teachers?' + new URLSearchParams({ query: '赵春明' }));
assert.ok(search.data.items.length);
const teacherId = search.data.items[0].id;
const path = `/api/teachers/${encodeURIComponent(teacherId)}/reviews`;
const cold = await get(path);
const warm = await get(path);
assert.equal(warm.cache, 'HIT');
assert.ok(warm.data.total >= 100);
const seen = new Set();
for (let page = 0; page * 100 < warm.data.total; page++) {
  const result = await get(`${path}?page=${page}&pageSize=100`);
  for (const row of result.data.items) {
    assert.equal(row.status, 'approved');
    for (const field of ['user_id', 'user_email', 'reviewer_id', 'reject_reason']) assert.equal(field in row, false);
    assert.ok(!seen.has(row.id));
    seen.add(row.id);
  }
}
const directReviews = await db.from('reviews').select('id', { count: 'exact' }).eq('teacher_id', teacherId).eq('status', 'approved')
  .order('created_at', { ascending: false }).order('id').range(0, 19);
assert.ifError(directReviews.error);
assert.equal(seen.size, directReviews.count);
assert.deepEqual(warm.data.items.map(row => row.id), directReviews.data.map(row => row.id));
const denied = await fetch(base + '/api/reviews/verification/approve', { method: 'POST', headers });
assert.equal(denied.status, 401);

const redis = new Redis({ host: '127.0.0.1', username: process.env.REDIS_USERNAME, password: process.env.REDIS_PASSWORD });
const prefix = `${process.env.CACHE_PREFIX}verification:${randomUUID()}:`;
const state = { teachers: [{ id: 'test-teacher', review_count: 1 }], reviews: [{ id: 'test-review', likes: 1 }] };
let teacherDownloads = 0;
let reviewDownloads = 0;
const source = {
  teachers: async () => { teacherDownloads++; return state.teachers; },
  teacher: async () => state.teachers[0],
  reviews: async () => { reviewDownloads++; return state.reviews; },
  review: async () => state.reviews[0] || null,
};
const cache = new CatalogCache(redis, source, { prefix, logger: { info() {}, warn() {} } });
try {
  await cache.teachers();
  await cache.reviews('test-teacher');
  state.teachers[0].review_count = 2;
  state.reviews[0].likes = 4;
  await cache.changedReview('test-teacher', 'test-review');
  assert.equal((await cache.teachers()).rows[0].review_count, 2);
  assert.equal((await cache.reviews('test-teacher')).rows[0].likes, 4);
  state.reviews = [];
  await cache.changedReview('test-teacher', 'test-review');
  assert.equal((await cache.reviews('test-teacher')).rows.length, 0);
  assert.equal(teacherDownloads, 1);
  assert.equal(reviewDownloads, 1);
} finally {
  await redis.del(cache.teacherKey, cache.reviewKey('test-teacher'));
  await redis.quit();
}
console.log(JSON.stringify({ verified: true, teachers: first.data.total, teacherHitMs: first.ms,
  courseMatches: course.data.total, historicalReviews: seen.size, reviewsFirstCache: cold.cache,
  reviewsFirstMs: cold.ms, reviewsHitMs: warm.ms, incrementalRedisUpdates: 'passed', authorization: 'passed' }));
