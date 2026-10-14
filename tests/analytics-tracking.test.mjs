import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

async function tracking({ enabled = true, hostname = 'huoshui3.top', visible = true, stored = null, brokenStorage = false } = {}) {
  const built = await build({ entryPoints: [fileURLToPath(new URL('../src/lib/analytics.ts', import.meta.url))],
    bundle: true, write: false, format: 'iife', globalName: 'tracking',
    define: { 'import.meta.env.VITE_ANALYTICS_ENABLED': JSON.stringify(String(enabled)) },
  });
  const calls = []; const listeners = new Map(); let counter = 0;
  const context = vm.createContext({
    fetch: async (url, options) => { calls.push({ url, options, args: JSON.parse(options.body) }); return { ok: true }; },
    window: { location: { hostname } }, document: { visibilityState: visible ? 'visible' : 'hidden',
      addEventListener: (name, listener) => listeners.set(name, listener), removeEventListener: name => listeners.delete(name) },
    localStorage: { getItem() { if (brokenStorage) throw new Error('disabled'); return stored; }, setItem(_key, value) { if (brokenStorage) throw new Error('disabled'); stored = value; } },
    crypto: { randomUUID: () => '00000000-0000-0000-0000-' + String(++counter).padStart(12, '0') },
    AbortSignal,
  });
  vm.runInContext(built.outputFiles[0].text, context);
  return { context, calls, listeners, start: () => context.tracking.startVisitTracking(), get stored() { return stored; } };
}
test('tracking is opt-in, skips local previews and counts a document only once', async () => {
  for (const options of [{ enabled: false }, { hostname: 'localhost' }, { hostname: '127.0.0.1' }, { hostname: '[::1]' }]) {
    const f = await tracking(options); f.start(); assert.equal(f.calls.length, 0);
  }
  const f = await tracking(); f.start(); f.start();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].url, '/api/analytics/visit');
  assert.equal(f.calls[0].options.credentials, 'omit'); assert.equal(f.calls[0].options.method, 'POST');
  assert.equal(f.calls[0].args.visitorId, f.stored);
  assert.notEqual(f.calls[0].args.visitorId, f.calls[0].args.eventId);
  assert.deepEqual(Object.keys(f.calls[0].args).sort(), ['eventId', 'visitorId']);
});
test('hidden documents wait until visible; unavailable storage does not break tracking', async () => {
  const f = await tracking({ visible: false }); f.start(); f.start(); assert.equal(f.calls.length, 0);
  f.context.document.visibilityState = 'visible'; f.listeners.get('visibilitychange')();
  assert.equal(f.calls.length, 1); assert.equal(f.listeners.size, 0);
  const noStorage = await tracking({ brokenStorage: true }); noStorage.start(); assert.equal(noStorage.calls.length, 1);
  const existing = '20000000-0000-0000-0000-000000000001';
  const repeat = await tracking({ stored: existing }); repeat.start(); assert.equal(repeat.calls[0].args.visitorId, existing);
});
test('plain HTTP browsers without randomUUID can still submit a valid visit', async () => {
  const f = await tracking({ hostname: '47.108.145.230' });
  f.context.crypto.randomUUID = undefined;
  let seed = 1;
  f.context.crypto.getRandomValues = bytes => { bytes.fill(seed++); return bytes; };
  f.start(); assert.equal(f.calls.length, 1);
  assert.match(f.calls[0].args.eventId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(f.calls[0].args.eventId, f.calls[0].args.visitorId);
});
