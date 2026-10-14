import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../app.mjs';
import { noticeOptions, noticePage, createNoticeReader } from '../notices.mjs';

// 记录链式调用的假 Supabase 客户端。
function fakeClient(result) {
  const calls = [];
  const query = {
    select: (...args) => { calls.push(['select', ...args]); return query; },
    contains: (...args) => { calls.push(['contains', ...args]); return query; },
    ilike: (...args) => { calls.push(['ilike', ...args]); return query; },
    order: (...args) => { calls.push(['order', ...args]); return query; },
    range: (...args) => { calls.push(['range', ...args]); return Promise.resolve(result); },
  };
  return { calls, from: table => { calls.push(['from', table]); return query; } };
}
const row = { id: 1, url: 'https://bksy.swjtu.edu.cn/info/1291/1.htm', title: 'T', published_on: '2026-09-30',
  categories: ['jsfz'], content: 'secret', content_fetched_at: 'x' };

test('options validate category, query length and pagination', () => {
  assert.deepEqual(noticeOptions({}), { page: 0, pageSize: 20, query: '', category: 'all' });
  assert.equal(noticeOptions({ category: 'jsfz', query: ' 竞赛 ' }).query, '竞赛');
  assert.throws(() => noticeOptions({ category: 'bogus' }), /category/);
  assert.throws(() => noticeOptions({ category: 'other' }), /category/);
  assert.throws(() => noticeOptions({ query: 'x'.repeat(101) }), /filter/);
  assert.throws(() => noticeOptions({ pageSize: '0' }), /page size/i);
  assert.throws(() => noticeOptions({ page: '-1' }), /pagination/i);
});

test('page query filters, orders newest first and hides non-public columns', async () => {
  const client = fakeClient({ data: [row], count: 41, error: null });
  const result = await noticePage(client, { page: 2, pageSize: 10, query: '50%_a\\b', category: 'jsfz' });
  assert.deepEqual(result, { items: [{ id: 1, url: row.url, title: 'T', published_on: '2026-09-30', categories: ['jsfz'] }], total: 41 });
  const names = client.calls.map(c => c[0]);
  assert.deepEqual(names, ['from', 'select', 'contains', 'ilike', 'order', 'order', 'range']);
  assert.deepEqual(client.calls[2], ['contains', 'categories', ['jsfz']]);
  assert.deepEqual(client.calls[3], ['ilike', 'title', '%50\\%\\_a\\\\b%']);
  assert.deepEqual(client.calls[4], ['order', 'published_on', { ascending: false }]);
  assert.deepEqual(client.calls[6], ['range', 20, 29]);
  assert.ok(!client.calls[1][1].includes('content'));
});

test('all categories adds no category filter; errors map to the right status', async () => {
  const ok = fakeClient({ data: [], count: 0, error: null });
  await noticePage(ok, { page: 0, pageSize: 20, query: '', category: 'all' });
  assert.deepEqual(ok.calls.map(c => c[0]), ['from', 'select', 'order', 'order', 'range']);
  await assert.rejects(noticePage(fakeClient({ data: null, count: null, error: { code: 'PGRST103', message: 'range' } }),
    { page: 9, pageSize: 20, query: '', category: 'all' }), error => error.status === 400);
  await assert.rejects(noticePage(fakeClient({ data: null, count: null, error: { message: 'down' } }),
    { page: 0, pageSize: 20, query: '', category: 'all' }), error => error.status === undefined);
  await assert.rejects(noticePage(fakeClient({ data: [row], count: null, error: null }),
    { page: 0, pageSize: 20, query: '', category: 'all' }), /Incomplete/);
});

test('reader caches identical queries for the ttl and evicts old entries', async () => {
  let clock = 0;
  const client = fakeClient({ data: [row], count: 1, error: null });
  const read = createNoticeReader(client, { ttlMs: 1000, maxEntries: 2, now: () => clock });
  const a = { page: 0, pageSize: 20, query: '', category: 'all' };
  assert.equal((await read(a)).cache, 'MISS');
  assert.equal((await read(a)).cache, 'HIT');
  clock = 1001;
  assert.equal((await read(a)).cache, 'MISS');
  await read({ ...a, query: 'b' }); await read({ ...a, query: 'c' });
  assert.equal((await read(a)).cache, 'MISS');
});

test('GET /api/notices responds through the app and rejects bad input', async t => {
  const client = fakeClient({ data: [row], count: 1, error: null });
  const cache = { available: true, lastSync: 1 };
  const server = createApp({ cache, authClient: client, userClient: () => client }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/notices?category=jsfz&pageSize=5`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-cache'), 'MISS');
  const body = await response.json();
  assert.equal(body.data.total, 1);
  assert.equal(body.data.items[0].title, 'T');
  assert.equal((await fetch(`${base}/api/notices?category=bogus`)).status, 400);
  assert.equal((await fetch(`${base}/api/notices?pageSize=1000`)).status, 400);
  assert.equal((await fetch(`${base}/api/notices?category=jsfz&pageSize=5`)).headers.get('x-cache'), 'HIT');
});
