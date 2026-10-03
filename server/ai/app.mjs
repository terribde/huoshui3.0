import express from 'express';
import { timingSafeEqual, randomUUID } from 'node:crypto';

export function createApp({ debugToken, invoke, webRouter, timeoutMs = 120_000, heartbeatMs = 10_000, maxConcurrent = 2, logger = console }) {
  if (typeof debugToken !== 'string' || debugToken.trim().length < 32) throw new Error('A debug token of at least 32 characters is required');
  const app = express();
  let active = 0;
  app.disable('x-powered-by');
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'swjtu-ai-internal', active }));
  app.use(express.json({ limit: '8kb' }));
  if (webRouter) app.use('/api/ai', webRouter);
  const internalPath = webRouter ? '/internal/ai' : '/api/ai';
  app.use(internalPath, (req, res, next) => {
    const supplied = Buffer.from(req.get('x-debug-token') || '');
    const expected = Buffer.from(debugToken);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return res.status(401).json({ message: 'unauthorized' });
    next();
  });
  app.use(express.json({ limit: '8kb' }));
  app.post(`${internalPath}/chat`, async (req, res) => {
    const prompt = req.body?.prompt;
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 1000) return res.status(400).json({ message: 'prompt 必须为 1–1000 字符的非空字符串' });
    if (active >= maxConcurrent) return res.status(429).json({ message: '当前请求较多，请稍后重试' });
    active++;
    const requestId = randomUUID();
    const ac = new AbortController();
    let result;
    let timedOut = false;
    const send = payload => {
      if (!res.destroyed && !res.writableEnded) res.write(`data: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n\n`);
    };
    const close = () => ac.abort();
    res.on('close', close);
    const deadline = setTimeout(() => { timedOut = true; ac.abort(); }, timeoutMs);
    res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no', 'X-Request-ID': requestId });
    res.flushHeaders();
    const heartbeat = setInterval(() => { if (!res.destroyed && !res.writableEnded) res.write(': heartbeat\n\n'); }, heartbeatMs);
    try {
      result = await invoke(prompt.trim(), ac.signal);
      // Attach the rejection handler immediately, including while consuming text.
      const completion = result.completed.then(() => null, error => error);
      for await (const chunk of result.toTextStream()) {
        if (ac.signal.aborted) break;
        send({ t: chunk });
      }
      const failure = await completion;
      if (failure) throw failure;
      if (ac.signal.aborted) throw new Error('aborted');
      send('[DONE]');
    } catch (error) {
      logger.error('[ai]', { requestId, status: error?.status, name: error?.name, timedOut, cancelled: ac.signal.aborted });
      send({ error: timedOut ? '请求超时，请稍后重试' : '服务暂时不可用，请稍后重试', requestId });
    } finally {
      clearTimeout(deadline);
      clearInterval(heartbeat);
      ac.abort();
      await result?.completed?.catch(() => {});
      res.off('close', close);
      active--;
      if (!res.destroyed && !res.writableEnded) res.end();
    }
  });
  app.use((error, _req, res, _next) => res.status(error.status === 413 ? 413 : 400).json({ message: '请求格式或大小不正确' }));
  return app;
}
