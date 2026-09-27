import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real hook with a deterministic hook/timer scheduler, no network or DOM.
const source = fs.readFileSync(new URL('../src/hooks/usePagedQuery.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export function usePagedQuery', 'function usePagedQuery')
  .replace(/^export /gm, '');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

// One module context per test: the hook's result cache lives at module scope, so a
// context is the app's lifetime. A "mount" is one component instance inside it — its
// state starts empty and unmounting tears its effects down, which is what switching
// tabs does, while the cache and in-flight requests survive across mounts.
function loadModule() {
  let frame = { slots: [], cursor: 0, dirty: false, unmounted: false, effects: [], timers: new Map(), timerId: 0 };
  // Virtual clock: cache expiry is time-based, and sleeping in tests is not.
  let clock = 1_000_000;
  const context = {
    AbortController, Error,
    Date: { now: () => clock },
    useState(initial) {
      const index = frame.cursor++;
      // React calls a function initializer lazily; seeding from the cache depends on it.
      if (!(index in frame.slots)) frame.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [frame.slots[index], next => {
        const updated = typeof next === 'function' ? next(frame.slots[index]) : next;
        if (!Object.is(updated, frame.slots[index])) { frame.slots[index] = updated; frame.dirty = true; }
      }];
    },
    useRef(initial) { const index = frame.cursor++; return frame.slots[index] ||= { current: initial }; },
    useEffect(effect, deps) {
      const index = frame.cursor++, previous = frame.slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        frame.effects.push(() => {
          if (frame.unmounted) return;
          previous?.cleanup?.();
          frame.slots[index] = { deps, cleanup: effect() };
        });
      }
    },
    setTimeout(callback) { frame.timers.set(++frame.timerId, callback); return frame.timerId; },
    clearTimeout(id) { frame.timers.delete(id); },
  };
  vm.createContext(context); vm.runInContext(compiled, context);
  return {
    invalidate: key => context.clearPagedQueryCache(key),
    advance: ms => { clock += ms; },
    now: () => clock,
    mount(options = {}) {
      frame = { slots: [], cursor: 0, dirty: false, unmounted: false, effects: [], timers: new Map(), timerId: 0 };
      const self = frame;
      const args = [options.key ?? '', options.load, options.enabled ?? true, 0, options.cacheTtlMs ?? 0];
      let value;
      const flush = () => {
        let remaining = 20;
        do {
          self.dirty = false; self.cursor = 0; self.effects = [];
          value = context.usePagedQuery(...args);
          self.effects.forEach(effect => effect());
          assert.ok(--remaining > 0, 'hook should settle');
        } while (self.dirty);
        return value;
      };
      return {
        get timers() { return self.timers.size; },
        setLoad(load) { args[1] = load; },
        unmount() { self.unmounted = true; for (const slot of self.slots) slot?.cleanup?.(); self.timers.clear(); },
        get mounted() { return !self.unmounted; },
        render(key, enabled = true, cacheTtlMs = 0) { args.splice(0, args.length, key, args[1], enabled, 0, cacheTtlMs); return flush(); },
        /** Render without running the effects: the very first paint of a mount. */
        focus(key, enabled = true, cacheTtlMs = 0) {
          args.splice(0, args.length, key, args[1], enabled, 0, cacheTtlMs);
          self.dirty = false; self.cursor = 0; self.effects = [];
          value = context.usePagedQuery(...args);
          return value;
        },
        /** Run the effects the last render queued, as React does after paint. */
        runEffects() { const queued = self.effects; self.effects = []; queued.forEach(effect => effect()); return self; },
        flush,
        fireTimers() { for (const [id, callback] of [...self.timers]) { self.timers.delete(id); callback(); } },
        async settle() { await new Promise(setImmediate); return flush(); },
      };
    },
  };
}

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const teacherPage = (items, total = items.length) => ({ items, total });

test('search waits for input and debounces edits into one request', async () => {
  let calls = 0;
  const app = loadModule();
  const m = app.mount({ enabled: false, load: async () => { calls++; return teacherPage(['result']); } });
  m.render('', false); m.fireTimers(); assert.equal(calls, 0);
  m.render('赵'); m.render('赵春'); m.render('赵春明');
  assert.equal(calls, 0);
  m.fireTimers(); assert.equal(calls, 1);
  assert.equal((await m.settle()).items[0], 'result');
});

test('a cancelled late response cannot replace the newer search results', async () => {
  const old = deferred(), latest = deferred(), signals = [];
  const app = loadModule();
  const m = app.mount({ load: (_page, signal) => { signals.push(signal); return signals.length === 1 ? old.promise : latest.promise; } });
  m.render('旧关键词'); m.fireTimers();
  m.render('新关键词'); m.fireTimers();
  assert.equal(signals[0].aborted, true);
  latest.resolve(teacherPage(['new'], 1));
  assert.equal((await m.settle()).items[0], 'new');
  old.resolve(teacherPage(['stale'], 10));
  const result = await m.settle();
  assert.equal(result.items[0], 'new'); assert.equal(result.total, 1);
});

test('changing filters resets the page and an emptied last page returns to the start', async () => {
  const pages = [];
  const app = loadModule();
  const m = app.mount({ load: async page => { pages.push(page); return page > 0 ? teacherPage([]) : teacherPage(['first'], 1); } });
  m.render('全部'); m.fireTimers();
  (await m.settle()).setPage(2); m.flush(); m.fireTimers();
  assert.equal((await m.settle()).page, 0);
  m.fireTimers(); await m.settle();
  m.flush().setPage(3); m.flush();
  assert.equal(m.render('学院').page, 0);
  m.fireTimers(); await m.settle();
  assert.deepEqual(pages, [0, 2, 0, 0]);
});

test('failed searches expose a retry and retry replaces the error with data', async () => {
  let attempts = 0;
  const app = loadModule();
  const m = app.mount({ load: async () => {
    if (++attempts === 1) throw new Error('offline');
    return teacherPage(['recovered'], 1);
  } });
  m.render('关键词'); m.fireTimers();
  const failed = await m.settle();
  assert.equal(failed.error, 'offline'); assert.equal(failed.loading, false);
  failed.reload(); m.flush(); m.fireTimers();
  const recovered = await m.settle();
  assert.equal(recovered.error, null); assert.equal(recovered.items[0], 'recovered');
});

test('returning to a previous filter starts at its first page', () => {
  const app = loadModule();
  const m = app.mount({ load: async () => teacherPage(['row'], 80) });
  m.render('A').setPage(2);
  assert.equal(m.flush().page, 2);
  assert.equal(m.render('B').page, 0);
  assert.equal(m.render('A').page, 0);
});

test('a cached page repaints on remount without loading and without another request', async () => {
  const app = loadModule();
  let calls = 0;
  const ttl = 60_000;
  const first = app.mount({ load: async () => { calls++; return teacherPage(['赵春明'], 1); } });
  first.render('老师库', true, ttl); first.fireTimers();
  assert.equal((await first.settle()).items[0], '赵春明');
  assert.equal(calls, 1);

  first.unmount();
  const reopened = app.mount({ load: async () => { calls++; return teacherPage(['赵春明'], 1); } });
  const painted = reopened.focus('老师库', true, ttl);
  assert.equal(painted.loading, false, 'a cached page must not show the loading placeholder');
  assert.deepEqual(painted.items, ['赵春明']);
  assert.equal(painted.total, 1);
  assert.equal(reopened.render('老师库', true, ttl).loading, false);
  reopened.fireTimers(); await reopened.settle();
  assert.equal(calls, 1, 'a fresh cache hit must not refetch');
});

test('a stale page keeps its rows visible while it revalidates in the background', async () => {
  const app = loadModule();
  let calls = 0;
  const ttl = 10_000;
  const load = async () => { calls++; return teacherPage([`第${calls}次`], 1); };
  const first = app.mount({ load });
  first.render('老师库', true, ttl); first.fireTimers();
  await first.settle();

  first.unmount();
  app.advance(ttl + 1);
  const reopened = app.mount({ load });
  const painted = reopened.focus('老师库', true, ttl);
  assert.equal(painted.loading, false, 'an expired page must not flash the loading placeholder');
  assert.deepEqual(painted.items, ['第1次']);
  // The mount's effect runs after paint, exactly as in the browser.
  reopened.runEffects();
  assert.equal(reopened.timers, 1, 'an expired entry schedules a background revalidation');
  reopened.fireTimers();
  const refreshed = await reopened.settle();
  assert.equal(calls, 2, 'an expired entry revalidates');
  assert.equal(refreshed.loading, false);
  assert.deepEqual(refreshed.items, ['第2次']);
});

test('a quick switch away and back joins the request instead of restarting it', async () => {
  const app = loadModule();
  const ttl = 60_000;
  const pending = deferred();
  let calls = 0;
  const load = () => { calls++; return pending.promise; };
  const first = app.mount({ load });
  first.render('老师库', true, ttl);
  first.fireTimers();
  assert.equal(calls, 1);

  first.unmount();
  const reopened = app.mount({ load });
  reopened.render('老师库', true, ttl);
  reopened.fireTimers();
  assert.equal(calls, 1, 'the remount must join the request instead of starting a second one');
  pending.resolve(teacherPage(['结果'], 1));
  assert.deepEqual((await reopened.settle()).items, ['结果']);
});

test('invalidating a cached list reloads it on the next visit', async () => {
  const app = loadModule();
  let calls = 0;
  const ttl = 60_000;
  const load = async () => { calls++; return teacherPage(['row'], 1); };
  const first = app.mount({ load });
  first.render('老师库', true, ttl); first.fireTimers();
  await first.settle();

  app.invalidate('老师库');
  first.unmount();
  const reopened = app.mount({ load });
  reopened.render('老师库', true, ttl); reopened.fireTimers();
  const reloaded = await reopened.settle();
  assert.equal(calls, 2, 'an invalidated list must reload');
  assert.equal(reloaded.loading, false);
  assert.deepEqual(reloaded.items, ['row']);
});

// The reported bug: leaving 教师库 and coming back showed 正在加载 and refetched every
// time. This drives the real query signature the library view passes and the real
// TTL, so it fails if the remount ever goes back to starting from a blank load.
test('revisiting 教师库 repaints instantly and does not restart the page load', async () => {
  const app = loadModule();
  const ttl = 5 * 60 * 1000; // useTeacherSearch
  const key = JSON.stringify({ query: '', collegeId: 'all', onlyThisTerm: false, sortBy: 'overall' });
  let requests = 0;
  const load = () => { requests++; return Promise.resolve(teacherPage([{ id: 't1', name: '李维宏' }], 835)); };

  // First visit: nothing cached yet, so the placeholder is expected and correct.
  const visit = app.mount({ load });
  const cold = visit.focus(key, true, ttl);
  assert.equal(cold.loading, true, 'a cold visit still shows a placeholder');
  visit.runEffects();
  visit.fireTimers();
  const loaded = await visit.settle();
  assert.equal(loaded.loading, false);
  assert.equal(loaded.total, 835);
  assert.equal(requests, 1);
  visit.unmount();

  // Second visit (switch to 首页 and back): the rows must be there on first paint.
  const back = app.mount({ load });
  const painted = back.focus(key, true, ttl);
  assert.equal(painted.loading, false, 'returning to 教师库 must not show 正在加载');
  assert.equal(painted.total, 835);
  assert.equal(painted.items[0].name, '李维宏');

  // A revisit must neither refetch nor park the render behind the typing debounce.
  const before = app.now();
  back.runEffects();
  assert.equal(requests, 1, 'a fresh revisit must not refetch');
  assert.equal(app.now() - before, 0, 'a cached page must not sit behind a debounce');
  assert.equal(back.timers, 0, 'a fresh revisit schedules no request at all');
});

// The state only seeds from the cache when the hook mounts. Changing the query back to
// an earlier value reuses that instance, so a fresh cache hit must be written into
// state instead of being skipped — otherwise the key never matches and the spinner is
// permanent with no request outstanding to clear it.
test('typing 龙, clearing it and typing 龙 again repaints from cache instead of hanging', async () => {
  const app = loadModule();
  const ttl = 5 * 60 * 1000;
  const key = term => JSON.stringify({ query: term, collegeId: 'all', onlyThisTerm: false, sortBy: 'overall' });
  let requests = 0;
  const load = async () => { requests++; return teacherPage([{ id: `t${requests}`, name: '龙文杰' }], 3); };

  const m = app.mount({ load });
  m.render(key(''), true, ttl); m.fireTimers();
  await m.settle();
  assert.equal(requests, 1, 'the empty query loads once');

  // type 龙 and let it load
  m.render(key('龙'), true, ttl); m.fireTimers();
  const first = await m.settle();
  assert.equal(first.loading, false);
  assert.equal(first.total, 3);
  assert.equal(requests, 2);

  // clear the field
  m.render(key(''), true, ttl); m.fireTimers();
  const cleared = await m.settle();
  assert.equal(cleared.loading, false);
  assert.equal(requests, 2, 'clearing back to a cached query must not refetch');

  // type 龙 again: must paint the cached page, not a permanent placeholder
  const retyped = m.render(key('龙'), true, ttl);
  assert.equal(retyped.loading, false, 'retyping 龙 must not leave 正在加载 on screen');
  assert.equal(retyped.total, 3);
  assert.equal(retyped.items[0].name, '龙文杰');
  m.fireTimers();
  const after = await m.settle();
  assert.equal(after.loading, false, 'and it must stay settled');
  assert.equal(requests, 2, 'the fresh cache hit must not refetch');
});
