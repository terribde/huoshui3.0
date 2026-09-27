import { supabase } from './supabase';

export const cacheApiEnabled = import.meta.env.VITE_CACHE_API_ENABLED === 'true';
const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export function cacheQuery(options: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && value !== null) query.set(key, String(value));
  }
  return query.toString();
}

export async function cacheRequest<T>(path: string, options: {
  method?: string; body?: unknown; authenticated?: boolean; signal?: AbortSignal;
} = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.authenticated) {
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) throw new Error('请重新登录后操作');
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET', headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal, cache: 'no-store',
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || !Object.prototype.hasOwnProperty.call(result, 'data')) {
    throw new Error(result?.message || '数据服务暂时不可用，请稍后重试');
  }
  return result.data as T;
}
