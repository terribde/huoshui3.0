import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.mjs';

const token = 'a'.repeat(48);
async function fixture(t, options = {}) {
  const server = createApp({ debugToken: token, logger: { error() {} }, ...options }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    post: (body, auth = token, signal) => fetch(`${base}/api/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { 'x-debug-token': auth } : {}) }, body: JSON.stringify(body), signal }),
  };
}
test('missing server secret fails closed', () => assert.throws(() => createApp({ invoke() {} })));
test('rejects absent/wrong credentials and malformed prompts before invoking model', async t => {
  let calls = 0;
  const f = await fixture(t, { invoke() { calls++; } });
  assert.equal((await f.post({ prompt: 'hi' }, '')).status, 401);
  assert.equal((await f.post({ prompt: 'hi' }, 'b'.repeat(48))).status, 401);
  for (const prompt of ['', '   ', {}, 42, 'x'.repeat(1001)]) assert.equal((await f.post({ prompt })).status, 400);
  assert.equal(calls, 0);
});
test('only text chunks are exposed and successful streams end with DONE', async t => {
  const f = await fixture(t, { invoke: async () => ({ completed: Promise.resolve(), reasoning_content: 'private reasoning', async *toTextStream() { yield '你好'; yield '同学'; } }) });
  const response = await f.post({ prompt: '你好' });
  const body = await response.text();
  assert.match(body, /你好/);
  assert.match(body, /data: \[DONE\]/);
  assert.doesNotMatch(body, /private reasoning/);
});
test('upstream failure emits safe error without DONE', async t => {
  const f = await fixture(t, { invoke: async () => { throw new Error('secret provider payload'); } });
  const body = await (await f.post({ prompt: 'hi' })).text();
  assert.match(body, /error/);
  assert.doesNotMatch(body, /secret provider payload|\[DONE\]/);
});
test('deadline aborts request and releases concurrency slot', async t => {
  let aborted = false;
  const f = await fixture(t, { timeoutMs: 40, heartbeatMs: 10, invoke: (_prompt, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('abort')); }, { once: true })) });
  const body = await (await f.post({ prompt: 'hi' })).text();
  assert.match(body, /请求超时/);
  assert.equal(aborted, true);
  assert.equal((await (await fetch(`${f.base}/health`)).json()).active, 0);
});
test('concurrency is bounded and client disconnect aborts upstream', async t => {
  let aborted;
  const cancelled = new Promise(resolve => { aborted = resolve; });
  const f = await fixture(t, { maxConcurrent: 1, invoke: (_prompt, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted(); reject(new Error('abort')); }, { once: true })) });
  const ac = new AbortController();
  const response = await f.post({ prompt: 'hi' }, token, ac.signal);
  assert.equal(response.status, 200);
  assert.equal((await f.post({ prompt: 'second' })).status, 429);
  ac.abort();
  await cancelled;
});
