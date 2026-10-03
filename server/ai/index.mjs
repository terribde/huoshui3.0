import { createAgent, run } from './agent.mjs';
import { createApp } from './app.mjs';
import { createWebRouter } from './web.mjs';
import { RedisConversations, SupabaseBilling } from './storage.mjs';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';

const agent = createAgent();
const invoke = (input, signal) => run(agent, input, { stream: true, signal, maxTurns: 3 });
let webRouter, redis, recovery;
if (process.env.AI_WEB_ENABLED === 'true') {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.REDIS_PASSWORD) throw new Error('Missing AI web credentials');
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) },
  });
  redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT || 6379),
    username: process.env.REDIS_USERNAME || 'default', password: process.env.REDIS_PASSWORD,
    enableOfflineQueue: false, maxRetriesPerRequest: 1, commandTimeout: 3000, lazyConnect: true });
  redis.on('error', error => console.warn('[ai-redis]', error.code || error.name));
  await redis.connect();
  const billing = new SupabaseBilling(db);
  const recover = () => billing.recover().catch(error => console.warn('[ai-recovery]', error.code || error.name));
  await recover();
  recovery = setInterval(recover, 60000); recovery.unref();
  webRouter = createWebRouter({ billing, store: new RedisConversations(redis), invoke,
    authenticate: async token => { const { data, error } = await db.auth.getUser(token); return error ? null : data.user?.id; },
  });
}
const app = createApp({
  debugToken: process.env.AI_DEBUG_TOKEN,
  invoke, webRouter,
});
const server = app.listen(3002, '127.0.0.1', () => console.info('[ai] listening on 127.0.0.1:3002'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  clearInterval(recovery);
  server.close(() => { redis?.disconnect(); process.exit(0); });
  setTimeout(() => process.exit(0), 10_000).unref();
});
