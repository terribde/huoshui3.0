import Redis from 'ioredis';
import { createClient } from '@supabase/supabase-js';
import { createSource } from './data.mjs';
import { CatalogCache } from './cache.mjs';
import { createApp } from './app.mjs';

const { SUPABASE_URL, SUPABASE_ANON_KEY, REDIS_PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !REDIS_PASSWORD) throw new Error('Missing server credentials');
const makeClient = token => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { headers: { 'x-rating-version': '2', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
});
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT || 6379),
  username: process.env.REDIS_USERNAME || 'default', password: REDIS_PASSWORD,
  enableOfflineQueue: false, maxRetriesPerRequest: 1, connectTimeout: 1000, commandTimeout: 1000,
  lazyConnect: true,
});
redis.on('error', error => console.warn('[redis]', error.code || error.name));
const client = makeClient();
const cache = new CatalogCache(redis, createSource(client), {
  prefix: process.env.CACHE_PREFIX || 'swjtu:prod:cache:v1:',
  ttl: Number(process.env.CACHE_TTL_SECONDS || 604800),
});
await redis.connect().catch(error => cache.failure(error));
await cache.synchronize().catch(error => console.warn('[startup]', error.message));
const app = createApp({ cache, authClient: client, userClient: makeClient });
const server = app.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1', () => {
  console.info('[api] listening on loopback');
});
const syncSeconds = Number(process.env.CACHE_SYNC_SECONDS || 3600);
const timer = setInterval(() => {
  if (!cache.available || Date.now() - cache.lastSync >= syncSeconds * 1000) {
    cache.synchronize().catch(error => console.warn('[sync]', error.message));
  }
}, 60000);
timer.unref();
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  clearInterval(timer);
  server.close(async () => { await cache.tail; redis.disconnect(); process.exit(0); });
});
