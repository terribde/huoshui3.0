import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Bot, Send, X, Square, Trash2, RefreshCw } from 'lucide-react';
import { ModalFrame } from './ModalFrame';
import { aiService, newAiId, type AiConfig, type AiStatus } from '../services/aiService';
type Message = { id: string; role: 'user' | 'assistant'; content: string; note?: string; prompt?: string };
interface Props {
  isOpen: boolean; userId: string | null; userPoints: number; initialPrompt?: string;
  onClose: () => void; onLogin: () => void; onBalance: (balance: number) => void;
}
export function AiAssistantModal({ isOpen, userId, userPoints, initialPrompt, onClose, onLogin, onBalance }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState<string | null>(null);
  const [conversation, setConversation] = useState(newAiId);
  const active = useRef<{ id: string; ac: AbortController; cancelled: boolean } | null>(null);
  const alive = useRef(true);
  const end = useRef<HTMLDivElement>(null);
  const balanceHandler = useRef(onBalance); balanceHandler.current = onBalance;
  const update = (id: string, patch: Partial<Message>) => { if (alive.current) setMessages(old => old.map(m => m.id === id ? { ...m, ...patch } : m)); };
  async function refresh() {
    if (!userId) return;
    try { const value = await aiService.config(); if (alive.current) { setConfig(value); balanceHandler.current(value.balance); setError(''); } }
    catch (e) { if (alive.current) { setConfig(null); setError((e as Error).message); } }
  }
  function stop() {
    const request = active.current; if (!request) return;
    request.cancelled = true;
    void aiService.cancel(request.id).catch(() => {}); request.ac.abort();
  }
  useEffect(() => { alive.current = true; return () => { alive.current = false; stop(); }; }, []);
  useEffect(() => { if (isOpen) { void refresh(); if (initialPrompt) setInput(initialPrompt); } else stop(); }, [isOpen, userId, initialPrompt]);
  useEffect(() => { if (isOpen) end.current?.scrollIntoView({ block: 'end' }); }, [messages, busy, isOpen]);
  function showState(id: string, state: AiStatus) {
    if (!alive.current) return;
    if (typeof state.balance === 'number') balanceHandler.current(state.balance);
    if (state.status === 'settled') {
      update(id, { ...(state.reply ? { content: state.reply } : {}), note: `已完成 · 消耗 ${state.cost} 积分` }); setUncertain(null);
    } else if (state.status === 'refunded') { update(id, { note: '未完成 · 积分已退回' }); setUncertain(null); }
    else if (state.status === 'not_found') { update(id, { note: '未完成 · 未扣积分' }); setUncertain(null); }
    else { update(id, { note: '积分处理中，请稍后确认状态' }); setUncertain(id); }
  }
  async function reconcile(id: string) {
    if (!alive.current) return;
    try { showState(id, await aiService.status(id)); }
    catch { if (alive.current) { setUncertain(id); update(id, { note: '暂时无法确认积分，请恢复连接后查询' }); } }
  }
  useEffect(() => {
    if (!uncertain || !isOpen) return;
    const timer = setInterval(() => { void reconcile(uncertain); }, 5000);
    return () => clearInterval(timer);
  }, [uncertain, isOpen]);
  async function send() {
    if (!userId) { onLogin(); return; }
    if (active.current || busy || uncertain || !input.trim() || !config?.available || !config.cost) return;
    const prompt = input.trim(), id = newAiId(), request = { id, ac: new AbortController(), cancelled: false };
    active.current = request; setBusy(true); setError(''); setInput('');
    setMessages(old => [...old, { id: `${id}-user`, role: 'user', content: prompt }, { id, role: 'assistant', content: '', prompt }]);
    let text = '', terminal = false;
    try {
      await aiService.chat({ prompt, requestId: id, conversationId: conversation, expectedCost: config.cost }, request.ac.signal, event => {
        if (!alive.current) return;
        if (event.type === 'delta') { text += event.text || ''; update(id, { content: text }); }
        if (event.type === 'status' && typeof event.balance === 'number') balanceHandler.current(event.balance);
        if (event.type === 'done' || event.type === 'error') {
          terminal = true; showState(id, event);
          if (event.type === 'error') setError(event.message || '本次回答未完成');
        }
      });
    } catch (e) {
      if (alive.current) { setError(request.cancelled ? '回答已停止' : (e as Error).message); await reconcile(id); }
    } finally {
      if (!terminal && request.cancelled && alive.current) await reconcile(id);
      active.current = null;
      if (alive.current) { setBusy(false); aiService.config().then(c => { if (alive.current) { setConfig(c); balanceHandler.current(c.balance); } }).catch(() => {}); }
    }
  }
  if (!isOpen) return null;
  const canSend = Boolean(userId && config?.available && config.cost && userPoints >= config.cost && input.trim() && !busy && !uncertain);
  return <ModalFrame id="ai-assistant-modal" label="交大 AI 助手" onClose={onClose}>
    <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />
    <section id="ai-assistant-content" className="modal-panel relative z-10 bg-white w-full max-w-2xl h-[90dvh] sm:h-[82dvh] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden">
      <header className="shrink-0 p-4 border-b border-gray-100 flex items-center gap-3 bg-indigo-50/60">
        <Bot className="w-9 h-9 p-2 rounded-xl bg-indigo-600 text-white" />
        <div className="flex-1 min-w-0"><h2 className="font-bold text-gray-900">交大 AI 助手</h2><p className="text-xs text-gray-500">学习与选课问答 · 暂未接入教师库</p></div>
        <button title="清空对话" aria-label="清空对话" disabled={busy || !!uncertain} onClick={() => { setMessages([]); setConversation(newAiId()); setError(''); }} className="p-2 text-gray-500 disabled:opacity-30"><Trash2 size={18} /></button>
        <button data-modal-close aria-label="关闭窗口" onClick={onClose} className="p-2 text-gray-500"><X size={20} /></button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        <div className="rounded-2xl bg-indigo-50 text-indigo-900 p-4 text-sm leading-6">你好！可以和我讨论学习方法、课程安排和选课思路。目前还不能查询具体教师评价、评分、课表或学校最新政策。<p className="mt-2 text-xs text-indigo-600">聊天仅在本页保留，刷新后清空。请以学校官方通知为准。</p></div>
        {!messages.length && <div className="flex flex-wrap gap-2">{['帮我规划一周的高数复习', '选课时应该考虑哪些因素？', '怎么平衡专业课与通识课？'].map(p => <button key={p} onClick={() => setInput(p)} className="text-xs border border-indigo-100 rounded-full py-2 px-3 text-indigo-700">{p}</button>)}</div>}
        {messages.map(m => <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div className={`min-w-0 max-w-[92%] rounded-2xl p-3.5 text-sm ${m.role === 'user' ? 'bg-indigo-600 text-white whitespace-pre-wrap' : 'bg-gray-50 border border-gray-100 text-gray-800'}`}>
            {m.role === 'user' ? m.content : <div className="ai-markdown break-words leading-7">{m.content ? <ReactMarkdown skipHtml components={{ img: () => null, a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">{children}</a>, pre: ({ children }) => <pre className="overflow-x-auto max-w-full bg-gray-100 rounded-lg p-2 my-2">{children}</pre>, ul: ({children}) => <ul className="list-disc pl-5">{children}</ul>, ol: ({children}) => <ol className="list-decimal pl-5">{children}</ol>, p: ({children}) => <p className="mb-2 last:mb-0">{children}</p> }}>{m.content}</ReactMarkdown> : busy && active.current?.id === m.id ? <span className="text-indigo-500 animate-pulse">正在思考…</span> : <span className="text-gray-400">未生成完整回答</span>}</div>}
            {m.note && <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">{m.note}</div>}
            {m.prompt && m.note?.startsWith('未完成') && <button disabled={busy || !!uncertain} onClick={() => setInput(m.prompt!)} className="mt-2 text-xs text-indigo-600 disabled:opacity-40">重新编辑并发送</button>}
          </div>
        </div>)}<div ref={end} />
      </div>
      <footer className="shrink-0 p-3 pb-[max(12px,env(safe-area-inset-bottom))] border-t border-gray-100 space-y-2">
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        {uncertain && <button onClick={() => reconcile(uncertain)} className="text-xs text-indigo-600 flex items-center gap-1"><RefreshCw size={13} />确认本次积分状态</button>}
        {!userId ? <button onClick={onLogin} className="w-full bg-indigo-600 text-white rounded-xl py-3 text-sm">登录后使用 AI 助手</button> : <>
          <div className="flex items-center justify-between gap-2 text-xs text-gray-500"><span>{config?.available ? `每次成功回答 ${config.cost} 积分 · 余额 ${userPoints}` : config ? 'AI 问答暂未开放' : '正在获取积分规则'}{config?.cost && userPoints < config.cost ? ' · 积分不足' : ''}</span><button onClick={refresh} disabled={busy} className="text-indigo-600">刷新</button></div>
          <div className="flex gap-2 items-end"><textarea id="ai-assistant-input" aria-label="问题" rows={2} maxLength={1000} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} placeholder="输入问题，Shift + Enter 换行" className="flex-1 min-w-0 resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm focus:outline-hidden focus:border-indigo-500" />
            {busy ? <button onClick={stop} aria-label="停止生成" className="rounded-xl bg-gray-800 text-white p-3"><Square size={20} /></button> : <button id="ai-assistant-send-btn" onClick={() => send()} disabled={!canSend} aria-label="发送" className="rounded-xl bg-indigo-600 text-white p-3 disabled:opacity-40"><Send size={20} /></button>}
          </div><p className="text-[10px] text-gray-400">发送时预扣，失败或完成前停止将退回。AI 回答可能有误。</p>
        </>}
      </footer>
    </section>
  </ModalFrame>;
}
