import { useEffect, useRef, useState } from 'react';
import type { DataPage } from '../types';

export function usePagedQuery<T>(key: string, load: (page: number, signal: AbortSignal) => Promise<DataPage<T>>, enabled = true, refreshToken: unknown = 0) {
  const [position, setPosition] = useState({ key, page: 0 });
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; page: number; items: T[]; total: number; loading: boolean; error: string | null }>({ key: '', page: 0, items: [], total: 0, loading: true, error: null });
  const loadRef = useRef(load);
  loadRef.current = load;
  const page = position.key === key ? position.page : 0;
  const setPage = (next: number) => setPosition({ key, page: Math.max(0, next) });
  useEffect(() => {
    setPosition(previous => previous.key === key ? previous : { key, page: 0 });
    if (!enabled) return;
    let active = true;
    const controller = new AbortController();
    setState(previous => ({ ...previous, key, page, total: previous.key === key ? previous.total : 0, items: [], loading: true, error: null }));
    // Cancel stale searches, including requests whose response arrives out of order.
    const timer = setTimeout(async () => {
      try {
        const result = await loadRef.current(page, controller.signal);
        if (active) {
          if (page > 0 && result.items.length === 0) setPosition({ key, page: 0 });
          setState({ key, page, ...result, loading: false, error: null });
        }
      } catch (error) {
        if (active && !controller.signal.aborted) setState({ key, page, items: [], total: 0, loading: false, error: error instanceof Error ? error.message : '读取失败，请重试' });
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [key, page, enabled, retry, refreshToken]);
  const current = state.key === key && state.page === page;
  return {
    items: current && enabled ? state.items : [], total: current && enabled ? state.total : 0,
    loading: enabled && (!current || state.loading), error: current && enabled ? state.error : null,
    page, setPage, reload: () => setRetry(value => value + 1),
  };
}
