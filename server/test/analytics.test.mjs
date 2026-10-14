import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createVisitStore, createAnalytics } from '../analytics.mjs';
import { createApp } from '../app.mjs';

const event = i => ({ eventId: '10000000-0000-0000-0000-' + String(i).padStart(12, '0'), visitorId: '20000000-0000-0000-0000-000000000001' });
function cache() {
  const entries = new Map();
  return { entries, hgetall: async key => entries.get(key) || {}, hset: async (key, value) => entries.set(key, value), expire: async () => {} };
}
test('durable visits survive Redis loss and server restart without double counting retries', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'swjtu-analytics-test-'));
  const path = join(directory, 'visits.sqlite');
  let store;
  t.after(async () => {
    store?.close();
    for (const suffix of ['', '-wal', '-shm']) await unlink(path + suffix).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(directory);
  });
  let now = Date.parse('2026-10-13T01:00:00Z');
  store = createVisitStore(DatabaseSync, { path, now: () => now });
  const redis = cache();
  const analytics = createAnalytics({ store, redis, now: () => now });
  assert.equal(analytics.record(event(1)), true); assert.equal(analytics.record(event(1)), false);
  assert.equal(analytics.record(event(2)), false);
  assert.equal((await analytics.overview(7, 'Asia/Tokyo')).totalViews, 1);
  now += 6000; assert.equal(analytics.record(event(2)), true);
  assert.equal((await analytics.overview(7, 'Asia/Tokyo')).totalViews, 1); // bounded 15-second cache
  redis.entries.clear(); assert.equal((await analytics.overview(7, 'Asia/Tokyo')).totalViews, 2);
  redis.hgetall = redis.hset = async () => { throw new Error('Redis down'); };
  now += 6000; assert.equal(analytics.record(event(3)), true);
  assert.equal((await analytics.overview(7, 'Asia/Tokyo')).totalViews, 3);
  store.close(); store = null;
  store = createVisitStore(DatabaseSync, { path, now: () => now });
  assert.equal(store.overview(7).totalViews, 3);
  now += 6000; assert.equal(store.record(event(1)), false);
  assert.equal(store.overview(7).totalViews, 3);
  assert.throws(() => createVisitStore(DatabaseSync, { path, timeZone: 'UTC' }), /differs/);
});
test('daily boundaries and unique browsers use the configured timezone', t => {
  let now = Date.parse('2026-10-12T14:59:00Z');
  const store = createVisitStore(DatabaseSync, { path: ':memory:', now: () => now }); t.after(() => store.close());
  store.record(event(1)); now += 120000; store.record(event(2));
  store.record({ ...event(3), visitorId: '20000000-0000-0000-0000-000000000002' });
  const stats = store.overview(7);
  assert.equal(stats.totalViews, 3); assert.equal(stats.periodViews, 3); assert.equal(stats.periodVisitors, 2);
  assert.equal(stats.todayViews, 2); assert.equal(stats.todayVisitors, 2);
  assert.equal(stats.daily.at(-1).date, '2026-10-13'); assert.equal(stats.daily.at(-2).views, 1);
  assert.equal(stats.daily.length, 7); assert.equal(stats.daily[0].views, 0);
  assert.throws(() => store.record({ ...event(4), visitorId: 'invalid' }), /Invalid visit/);
  assert.throws(() => store.overview(100), /Invalid analytics range/);
});
test('cold collector has no fabricated history, and expired Redis snapshots refresh', async t => {
  let now = Date.parse('2026-10-13T01:00:00Z');
  const store = createVisitStore(DatabaseSync, { path: ':memory:', now: () => now }); t.after(() => store.close());
  const analytics = createAnalytics({ store, redis: cache(), now: () => now });
  assert.equal((await analytics.overview(7, 'Asia/Tokyo')).firstEventAt, null);
  store.record(event(1)); now += 16000;
  assert.equal((await analytics.overview(7, 'Asia/Tokyo')).totalViews, 1);
  await assert.rejects(analytics.overview(7, 'Asia/Shanghai'), /timezones/);
});
test('visit endpoint validates origin and inputs; stats require a private token', async t => {
  const store = createVisitStore(DatabaseSync, { path: ':memory:' }); t.after(() => store.close());
  const analytics = createAnalytics({ store, redis: cache() });
  const token = 'test-analytics-token-with-32-characters';
  const app = createApp({ cache: { available: true, lastSync: 0 }, analytics, analyticsToken: token, analyticsOrigins: ['https://huoshui3.top'], logger: { error() {} } });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (body = event(1), headers = {}) => fetch(base + '/api/analytics/visit', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://huoshui3.top', ...headers }, body: JSON.stringify(body),
  });
  assert.equal((await post()).status, 204); assert.equal(store.overview(7).totalViews, 1);
  assert.equal((await post()).status, 204); assert.equal(store.overview(7).totalViews, 1);
  assert.equal((await post(event(2), { Origin: 'https://evil.test' })).status, 403);
  assert.equal((await post(event(2), { Origin: '' })).status, 403);
  assert.equal((await post(event(2), { 'Content-Type': 'text/plain' })).status, 403);
  assert.equal((await post(event(2), { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await post({ eventId: 'x', visitorId: 'y' })).status, 400);
  const path = base + '/api/analytics/overview?days=7&timeZone=Asia%2FTokyo';
  assert.equal((await fetch(path)).status, 401);
  assert.equal((await fetch(path, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  const response = await fetch(path, { headers: { Authorization: 'Bearer ' + token } });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).data.totalViews, 1);
  for (const query of ['days=7&days=14&timeZone=Asia%2FTokyo', 'days=8&timeZone=Asia%2FTokyo', 'days=7&timeZone=UTC']) {
    assert.equal((await fetch(base + '/api/analytics/overview?' + query, { headers: { Authorization: 'Bearer ' + token } })).status, 400);
  }
  let limited;
  for (let i = 0; i < 241; i++) limited = await post(event(2));
  assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal(store.overview(7).totalViews, 1);
});
