import { supabase } from '../lib/supabase';
export type AiConfig = { available: boolean; cost: number | null; balance: number; maxLength: number };
export type AiStatus = { status: 'pending' | 'settled' | 'refunded' | 'not_found'; balance?: number; cost?: number; reply?: string };
export type AiEvent = AiStatus & { type: string; text?: string; message?: string; phase?: string; requestId?: string };
export function newAiId() {
  // getRandomValues works over HTTP; randomUUID requires a secure context.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const s = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
}
async function headers() {
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error('请先登录后使用 AI 助手');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}
async function json<T>(path: string, method = 'GET'): Promise<T> {
  const response = await fetch(`/api/ai${path}`, { method, headers: await headers(), signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || '服务暂时不可用');
  return data;
}
export const aiService = {
  config: () => json<AiConfig>('/config'),
  status: (id: string) => json<AiStatus>(`/requests/${id}`),
  cancel: (id: string) => json<AiStatus>(`/requests/${id}/cancel`, 'POST'),
  async chat(body: { prompt: string; conversationId: string; requestId: string; expectedCost: number }, signal: AbortSignal, onEvent: (event: AiEvent) => void) {
    const response = await fetch('/api/ai/chat', { method: 'POST', headers: await headers(), body: JSON.stringify(body), signal });
    if (!response.ok) { const data = await response.json(); throw new Error(data.message || '服务暂时不可用'); }
    if (!response.body) throw new Error('浏览器不支持流式读取');
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let pending = '', terminal = false;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        pending += decoder.decode(value, { stream: true });
        let end;
        while ((end = pending.indexOf('\n\n')) >= 0) {
          const frame = pending.slice(0, end); pending = pending.slice(end + 2);
          if (!frame.startsWith('data: ')) continue;
          const event = JSON.parse(frame.slice(6)) as AiEvent; onEvent(event);
          if (event.type === 'done' || event.type === 'error') terminal = true;
        }
      }
    } finally { reader.releaseLock(); }
    if (!terminal) throw new Error('连接中断，正在确认本次积分状态');
  },
};
