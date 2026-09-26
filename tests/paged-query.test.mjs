import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real hook with a deterministic hook/timer scheduler, no network or DOM.
const source = fs.readFileSync(new URL('../src/hooks/usePagedQuery.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export function usePagedQuery', 'function usePagedQuery');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(load) {
  const slots = [], timers = new Map();
  let cursor = 0, timerId = 0, dirty = false, value, effects = [], args = ['', load, false];
  const context = { AbortController, Error,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], next => {
        const updated = typeof next === 'function' ? next(slots[index]) : next;
        if (!Object.is(updated, slots[index])) { slots[index] = updated; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
      }
    },
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  };
  vm.createContext(context); vm.runInContext(compiled, context);
  const flush = () => {
    let remaining = 20;
    do {
      dirty = false; cursor = 0; effects = [];
      value = context.usePagedQuery(...args);
      effects.forEach(effect => effect());
      assert.ok(--remaining > 0, 'hook should settle');
    } while (dirty);
    return value;
  };
  return {
    render(key, enabled = true) { args = [key, load, enabled]; return flush(); },
    flush,
    fireTimers() { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } },
    async settle() { await new Promise(setImmediate); return flush(); },
  };
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('search waits for input and debounces edits into one request', async () => {
  let calls = 0;
  const hook = harness(async () => { calls++; return { items: ['result'], total: 1 }; });
  hook.render('', false); hook.fireTimers(); assert.equal(calls, 0);
  hook.render('赵'); hook.render('赵春'); hook.render('赵春明');
  assert.equal(calls, 0);
  hook.fireTimers(); assert.equal(calls, 1);
  assert.equal((await hook.settle()).items[0], 'result');
});

test('a cancelled late response cannot replace the newer search results', async () => {
  const old = deferred(), latest = deferred(), signals = [];
  const hook = harness((_page, signal) => {
    signals.push(signal); return signals.length === 1 ? old.promise : latest.promise;
  });
  hook.render('旧关键词'); hook.fireTimers();
  hook.render('新关键词'); hook.fireTimers();
  assert.equal(signals[0].aborted, true);
  latest.resolve({ items: ['new'], total: 1 });
  assert.equal((await hook.settle()).items[0], 'new');
  old.resolve({ items: ['stale'], total: 10 });
  const result = await hook.settle();
  assert.equal(result.items[0], 'new'); assert.equal(result.total, 1);
});

test('changing filters resets the page and an emptied last page returns to the start', async () => {
  const pages = [];
  const hook = harness(async page => {
    pages.push(page); return { items: page > 0 ? [] : ['first'], total: 1 };
  });
  hook.render('全部'); hook.fireTimers();
  (await hook.settle()).setPage(2); hook.flush(); hook.fireTimers();
  assert.equal((await hook.settle()).page, 0);
  hook.fireTimers(); await hook.settle();
  hook.flush().setPage(3); hook.flush();
  assert.equal(hook.render('学院').page, 0);
  hook.fireTimers(); await hook.settle();
  assert.deepEqual(pages, [0, 2, 0, 0]);
});

test('failed searches expose a retry and retry replaces the error with data', async () => {
  let attempts = 0;
  const hook = harness(async () => {
    if (++attempts === 1) throw new Error('offline');
    return { items: ['recovered'], total: 1 };
  });
  hook.render('关键词'); hook.fireTimers();
  const failed = await hook.settle();
  assert.equal(failed.error, 'offline'); assert.equal(failed.loading, false);
  failed.reload(); hook.flush(); hook.fireTimers();
  const recovered = await hook.settle();
  assert.equal(recovered.error, null); assert.equal(recovered.items[0], 'recovered');
});

test('returning to a previous filter starts at its first page', () => {
  const hook = harness(async () => ({ items: ['row'], total: 80 }));
  hook.render('A').setPage(2);
  assert.equal(hook.flush().page, 2);
  assert.equal(hook.render('B').page, 0);
  assert.equal(hook.render('A').page, 0);
});
