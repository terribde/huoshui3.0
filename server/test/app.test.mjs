import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../app.mjs';

async function fixture(t) {
  const calls = [];
  const cache = { available: true, lastSync: 1,
    terms: async () => ({ cache: 'HIT', rows: [{ id: 'current', is_current: true }] }),
    timetable: async termId => { calls.push(['timetable', termId]); return { cache: 'MISS', rows: [{
      id: 's', courseName: 'Calculus', campus: '犀浦校区', meetings: [{ id: 'm', teacherId: 't', weekday: 1 }],
    }] }; },
    teachers: async () => ({ cache: 'HIT', rows: [{ id: 't', name: 'Teacher', overall_score: 4 }] }),
    reviews: async () => ({ cache: 'HIT', rows: [{ id: 'r', teacher_id: 't', status: 'approved', created_at: '2026-01-01' }] }),
    mutate: operation => operation(), changedReview: async (...args) => { calls.push(['refresh', ...args]); },
  };
  const authClient = { auth: { getUser: async token => ({ data: { user: token === 'invalid' ? null : { id: token } } }) } };
  const userClient = token => ({
    from() {
      let operation = 'read';
      const query = { select: () => query, eq: () => query,
        maybeSingle: async () => ({ data: { id: 'r', teacher_id: 't', status: 'approved', user_id: 'student' } }),
        delete: () => { operation = 'delete'; return query; },
        update: payload => { calls.push(['update', payload]); operation = 'update'; return query; },
        then: resolve => Promise.resolve({ data: token === 'admin' || operation === 'update' ? [{ id: 'r' }] : [] }).then(resolve),
      }; return query;
    },
    async rpc(name, args) {
      calls.push(['rpc', token, name, args]);
      if (name === 'set_review_like') return { data: { likes: 4, liked: args.p_liked } };
      if (token !== 'admin') return { error: { message: 'permission denied' } };
      return { data: { success: true } };
    },
  });
  const server = createApp({ cache, authClient, userClient }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { calls, request: (path, token, method = 'GET', body) => fetch(base + path, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }) };
}

test('recommendation API selects current term and validates filters before loading snapshots', async t => {
  const f = await fixture(t);
  const response = await f.request('/api/timetable/recommendations?query=Calculus&weekday=1');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-cache'), 'MISS');
  assert.equal((await response.json()).data[0].teacher.id, 't');
  assert.deepEqual(f.calls, [['timetable', 'current']]);
  assert.equal((await f.request('/api/timetable/recommendations?weekday=8')).status, 400);
  assert.equal(f.calls.length, 1);
});
test('public reads use cache while privileged routes reject absent or invalid sessions', async t => {
  const f = await fixture(t);
  const response = await f.request('/api/teachers');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-cache'), 'HIT');
  assert.equal((await response.json()).data.total, 1);
  assert.equal((await f.request('/api/reviews/r/approve', undefined, 'POST')).status, 401);
  assert.equal((await f.request('/api/reviews/r/approve', 'invalid', 'POST')).status, 401);
  assert.equal(f.calls.length, 0);
});
test('moderation preserves database authorization and only successful writes refresh cache', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/reviews/r/approve', 'student', 'POST')).status, 400);
  assert.equal(f.calls.filter(c => c[0] === 'refresh').length, 0);
  assert.equal((await f.request('/api/reviews/r/approve', 'admin', 'POST')).status, 200);
  assert.equal(f.calls.filter(c => c[0] === 'refresh').length, 1);
  assert.equal((await f.request('/api/reviews/r', 'student', 'DELETE')).status, 403);
  assert.equal(f.calls.filter(c => c[0] === 'refresh').length, 1);
});
test('like refresh is limited to the affected review and malformed state is rejected', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/reviews/r/like', 'student', 'POST', { liked: 'yes' })).status, 400);
  const response = await f.request('/api/reviews/r/like', 'student', 'POST', { liked: true });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { likes: 4, liked: true } });
  assert.deepEqual(f.calls.at(-1), ['refresh', 't', 'r', { teacherChanged: false }]);
});
test('editing ignores caller supplied identity, status and review metadata', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/reviews/r', 'student', 'PATCH', {
    rating_version: 2, comment: 'updated', status: 'approved', user_id: 'admin', likes: 999, reviewer_id: 'admin',
  })).status, 200);
  assert.deepEqual(f.calls.find(c => c[0] === 'update')[1], {
    rating_version: 2, comment: 'updated', status: 'pending', reject_reason: null,
  });
});
