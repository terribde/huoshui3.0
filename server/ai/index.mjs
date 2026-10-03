import { createAgent, run } from './agent.mjs';
import { createApp } from './app.mjs';

const agent = createAgent();
const app = createApp({
  debugToken: process.env.AI_DEBUG_TOKEN,
  invoke: (prompt, signal) => run(agent, prompt, { stream: true, signal, maxTurns: 3 }),
});
const server = app.listen(3002, '127.0.0.1', () => console.info('[ai] listening on 127.0.0.1:3002'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10_000).unref();
});
