import { Router } from 'express';
import { createHash } from 'node:crypto';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const errors = {
  price_changed: [409, '积分价格已变更，请确认最新价格后重新发送'],
  insufficient_points: [402, '积分不足，请先获取积分'],
  ai_rule_unavailable: [503, 'AI 问答暂未开放'],
  ai_request_in_progress: [409, '上一条请求仍在处理，请稍后重试'],
  request_id_conflict: [409, '请求编号已用于其他内容，请重新发送'],
  profile_not_found: [409, '积分账户尚未就绪，请重新登录'],
};
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export function createWebRouter({ authenticate, billing, store, invoke, timeoutMs = 120000, maxConcurrent = 2, logger = console }) {
  const router = Router();
  const running = new Map();
  const accounts = new Set();
  router.use(wrap(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const token = /^Bearer (\S+)$/i.exec(req.get('authorization') || '')?.[1];
    if (!token) return res.status(401).json({ message: '请先登录' });
    req.aiUser = await authenticate(token);
    if (!req.aiUser) return res.status(401).json({ message: '登录已过期，请重新登录' });
    next();
  }));
  router.get('/config', wrap(async (req, res) => res.json(await billing.config(req.aiUser))));
  router.get('/requests/:id', wrap(async (req, res) => {
    if (!uuid(req.params.id)) return res.status(400).json({ message: '请求编号不正确' });
    const result = await billing.status(req.aiUser, req.params.id);
    const cached = result.status === 'settled' ? await store.result(req.aiUser, req.params.id).catch(() => null) : null;
    res.json({ ...result, reply: cached?.reply });
  }));
  router.post('/requests/:id/cancel', wrap(async (req, res) => {
    if (!uuid(req.params.id)) return res.status(400).json({ message: '请求编号不正确' });
    await store.cancel(req.aiUser, req.params.id);
    running.get(`${req.aiUser}:${req.params.id}`)?.abort();
    res.json(await billing.status(req.aiUser, req.params.id));
  }));
  router.post('/chat', wrap(async (req, res) => {
    const { prompt, conversationId, requestId, expectedCost } = req.body || {};
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 1000 || !uuid(conversationId) || !uuid(requestId) || !Number.isInteger(expectedCost) || expectedCost <= 0) {
      return res.status(400).json({ message: '请输入 1–1000 字符的问题，并刷新积分价格' });
    }
    const user = req.aiUser, key = `${user}:${requestId}`;
    if (accounts.has(user) || running.size >= maxConcurrent) return res.status(429).json({ message: '当前正在生成回答，请稍后重试' });
    const ac = new AbortController();
    accounts.add(user); running.set(key, ac);
    const close = () => ac.abort();
    res.once('close', close);
    let reservation, reserveAttempted = false, result, heartbeat, completed = false, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ac.abort(); }, timeoutMs);
    const send = event => { if (!res.destroyed && !res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`); };
    try {
      if (!await store.rate(user)) { res.status(429).json({ message: '提问较频繁，请一分钟后再试' }); return; }
      const pairs = await store.history(user, conversationId);
      const settled = await billing.settled(user, pairs.map(p => p.requestId));
      const valid = pairs.filter(p => settled.has(p.requestId)).slice(-8);
      while (valid.reduce((n,p) => n+p.prompt.length+p.reply.length,0) > 20000) valid.shift();
      const history = valid.flatMap(p => [{ role: 'user', content: p.prompt }, { role: 'assistant', content: p.reply }]);
      // Request identity remains stable even if the conversation has advanced on retry.
      const hash = createHash('sha256').update(JSON.stringify({ conversationId, prompt: prompt.trim() })).digest('hex');
      if (ac.signal.aborted || await store.cancelled(user, requestId)) throw new Error('cancelled');
      reserveAttempted = true;
      reservation = await billing.reserve(user, requestId, hash, expectedCost);
      if (!reservation.created) {
        const state = await billing.status(user, requestId);
        const saved = state.status === 'settled' ? await store.result(user, requestId) : null;
        return res.status(409).json({ message: '该请求已处理，请查看请求状态', ...state, reply: saved?.reply });
      }
      if (ac.signal.aborted || await store.cancelled(user, requestId)) throw new Error('cancelled');
      res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      send({ type: 'status', phase: 'thinking', balance: reservation.balance, cost: reservation.cost, requestId });
      heartbeat = setInterval(() => { if (!res.destroyed) res.write(': heartbeat\n\n'); }, 10000);
      result = await invoke([...history, { role: 'user', content: prompt.trim() }], ac.signal);
      const completion = result.completed.then(() => null, e => e);
      let reply = '';
      for await (const text of result.toTextStream()) {
        if (ac.signal.aborted) break;
        reply += text;
        if (reply.length > 24000) throw new Error('output_limit');
        send({ type: 'delta', text });
      }
      const failure = await completion;
      if (failure) throw failure;
      if (ac.signal.aborted || await store.cancelled(user, requestId)) throw new Error('cancelled');
      if (!reply.trim()) throw new Error('empty_response');
      // Stage context before settlement. Only settled pairs are eligible on future turns.
      await store.saveResult(user, requestId, { reply });
      await store.save(user, conversationId, [...valid, { requestId, prompt: prompt.trim(), reply }]);
      if (ac.signal.aborted || await store.cancelled(user, requestId)) throw new Error('cancelled');
      const final = await billing.finalize(user, requestId, 'settled', 'completed');
      if (final.status !== 'settled') throw new Error('settlement_failed');
      completed = true;
      send({ type: 'done', ...final, requestId });
    } catch (error) {
      let state = { status: 'not_found' };
      // A lost RPC response may hide a successful reserve/settle. Always reconcile via DB.
      if (reserveAttempted && !errors[error.message]) {
        try {
          state = await billing.status(user, requestId);
          if (state.status === 'pending') state = await billing.finalize(user, requestId, 'refunded', timedOut ? 'timeout' : ac.signal.aborted || error.message === 'cancelled' ? 'cancelled' : error.message === 'empty_response' ? 'empty_response' : 'failed');
        } catch { state = { status: 'pending' }; }
      }
      if (state.status === 'settled') { completed = true; send({ type: 'done', ...state, requestId }); }
      else {
        const [http, message] = errors[error.message] || [503, timedOut ? '回答超时，请稍后重试' : ac.signal.aborted || error.message === 'cancelled' ? '回答已停止' : '服务暂时不可用，请稍后重试'];
        const payload = { type: 'error', message, ...state, requestId };
        if (res.headersSent) send(payload);
        else if (!res.destroyed) res.status(http).json(payload);
      }
      logger.error('[ai-web]', { requestId, code: error.code || error.name, billing: state.status });
    } finally {
      clearTimeout(timer); clearInterval(heartbeat); ac.abort();
      await result?.completed?.catch(() => {});
      res.off('close', close);
      running.delete(key); accounts.delete(user);
      if (!res.destroyed && !res.writableEnded) res.end();
    }
  }));
  router.use((error, _req, res, _next) => {
    logger.error('[ai-web-request]', { name: error.name });
    if (!res.headersSent) res.status(503).json({ message: '服务暂时不可用，请稍后重试' });
  });
  return router;
}
