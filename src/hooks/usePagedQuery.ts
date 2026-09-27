import { useEffect, useRef, useState } from 'react';
import type { DataPage } from '../types';

/**
 * Result cache that lives outside the React tree.
 *
 * Switching tabs unmounts the view that owns this hook, which used to throw away
 * every loaded page — returning to a list re-ran the request and replayed the
 * loading placeholder. The cache keeps the last result per query signature + page
 * so a remount renders it synchronously, and concurrent subscribers share one
 * request so a quick switch away and back cannot cancel and restart its own load.
 */
const CACHE_LIMIT = 40;
const cache = new Map<string, { page: DataPage<unknown>; at: number }>();
type SharedRequest = { promise: Promise<DataPage<unknown>>; controller: AbortController; subscribers: Set<AbortSignal> };
const inFlight = new Map<string, SharedRequest>();
const cacheId = (key: string, page: number) => `${page}\u0000${key}`;
const isPage = (value: unknown): value is DataPage<unknown> =>
  Boolean(value) && Array.isArray((value as DataPage<unknown>).items) && typeof (value as DataPage<unknown>).total === 'number';

function readCached<T>(id: string, ttlMs: number): { page: DataPage<T>; fresh: boolean } | null {
  const hit = cache.get(id);
  if (!hit) return null;
  // A malformed entry must never be rendered as a result.
  if (!isPage(hit.page)) { cache.delete(id); return null; }
  return { page: hit.page as DataPage<T>, fresh: Date.now() - hit.at < ttlMs };
}

function writeCached(id: string, page: DataPage<unknown>) {
  cache.delete(id);
  cache.set(id, { page, at: Date.now() });
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
}

/**
 * One request per signature: a remount joins the pending load instead of restarting
 * it. The request is aborted once every subscriber has abandoned it, so a stale
 * search is still cancelled rather than left to finish in the background.
 */
function subscribeTo(entry: SharedRequest): (signal: AbortSignal) => void {
  return signal => {
    if (signal.aborted) return;
    entry.subscribers.add(signal);
    signal.addEventListener('abort', () => {
      entry.subscribers.delete(signal);
      // Nobody is waiting for this page any more, so stop the request.
      if (!entry.subscribers.size) entry.controller.abort();
    }, { once: true });
  };
}

function requestPage<T>(id: string, run: (signal: AbortSignal) => Promise<DataPage<T>>): { promise: Promise<DataPage<T>>; subscribe: (signal: AbortSignal) => void } {
  const pending = inFlight.get(id) ?? (() => {
    const entry: SharedRequest = { promise: undefined as unknown as Promise<DataPage<unknown>>, controller: new AbortController(), subscribers: new Set() };
    entry.promise = run(entry.controller.signal)
      .then(result => { inFlight.delete(id); return result as DataPage<unknown>; })
      .catch(error => { inFlight.delete(id); throw error; });
    inFlight.set(id, entry);
    return entry;
  })();
  return { promise: pending.promise as Promise<DataPage<T>>, subscribe: subscribeTo(pending) };
}

/**
 * Drop cached pages so the next visit reloads. Call after a mutation that changes
 * what a list should contain; with no argument the whole cache is cleared.
 * Passing a query signature clears just that list, e.g.
 * `clearPagedQueryCache(JSON.stringify({ query: '', collegeId: 'all', onlyThisTerm: false, sortBy: 'overall' }))`.
 */
export function clearPagedQueryCache(key?: string) {
  if (key === undefined) { cache.clear(); return; }
  for (let page = 0; page < 100; page++) cache.delete(cacheId(key, page));
}

export function usePagedQuery<T>(
  key: string,
  load: (page: number, signal: AbortSignal) => Promise<DataPage<T>>,
  enabled = true,
  refreshToken: unknown = 0,
  cacheTtlMs = 0,
) {
  const [position, setPosition] = useState({ key, page: 0 });
  const [retry, setRetry] = useState(0);
  const page = position.key === key ? position.page : 0;
  const id = cacheId(key, page);
  const cached = enabled && cacheTtlMs > 0 ? readCached<T>(id, cacheTtlMs) : null;
  // Seeded from the cache so a remount paints the previous result on its first render.
  const [state, setState] = useState<{ key: string; page: number; items: T[]; total: number; loading: boolean; error: string | null }>(
    () => ({ key, page, items: cached?.page.items ?? [], total: cached?.page.total ?? 0, loading: !cached, error: null }),
  );
  const loadRef = useRef(load);
  loadRef.current = load;
  const setPage = (next: number) => setPosition({ key, page: Math.max(0, next) });
  const ttlRef = useRef(cacheTtlMs);
  ttlRef.current = cacheTtlMs;

  useEffect(() => {
    setPosition(previous => previous.key === key ? previous : { key, page: 0 });
    if (!enabled) return;
    // Fresh within the TTL: the cache already matches what the request would return.
    // It still has to be written into state — a render only seeds from the cache when
    // it mounts, so returning here would leave `key` unmatched and spin forever.
    if (cached?.fresh) {
      if (!(state.key === key && state.page === page)) setState({ key, page, ...cached.page, loading: false, error: null });
      return;
    }
    let active = true;
    const controller = new AbortController();
    // A stale cache entry still counts as renderable data: refresh it in the
    // background instead of clearing the list back to the loading placeholder.
    const hasResult = Boolean(cached) || (state.key === key && state.page === page);
    if (!hasResult) setState({ key, page, items: [], total: 0, loading: true, error: null });
    const loadPage = async (join: { promise: Promise<DataPage<T>>; subscribe: (signal: AbortSignal) => void }) => {
      // A retry has no result to keep showing while it runs, so it shows the placeholder.
      if (state.key === key && state.page === page && state.error) setState(previous => ({ ...previous, loading: true, error: null }));
      join.subscribe(controller.signal);
      try {
        const result = await join.promise;
        if (ttlRef.current > 0) writeCached(id, result);
        if (active) {
          if (page > 0 && result.items.length === 0) setPosition({ key, page: 0 });
          setState({ key, page, ...result, loading: false, error: null });
        }
      } catch (error) {
        if (active && !controller.signal.aborted) setState({ key, page, items: [], total: 0, loading: false, error: error instanceof Error ? error.message : '读取失败，请重试' });
      }
    };

    // Another mount may already be loading this page; join it instead of restarting.
    const pending = cacheTtlMs > 0 ? inFlight.get(id) : undefined;
    if (pending) { loadPage({ promise: pending.promise as Promise<DataPage<T>>, subscribe: subscribeTo(pending) }); return () => { active = false; controller.abort(); }; }
    // Debounce typing, never a page the user is waiting on: paint from the cache or
    // from an existing result at once.
    const timer = setTimeout(() => loadPage(requestPage<T>(id, signal => loadRef.current(page, signal))), hasResult ? 0 : 250);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page, enabled, retry, refreshToken, cacheTtlMs]);

  const current = state.key === key && state.page === page;
  return {
    items: current && enabled ? state.items : [], total: current && enabled ? state.total : 0,
    loading: enabled && (!current || state.loading), error: current && enabled ? state.error : null,
    page, setPage, reload: () => setRetry(value => value + 1),
  };
}
