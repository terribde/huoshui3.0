import { createAgent, run } from './agent.mjs';
const result = await run(createAgent(), '用一句话介绍你自己。', { signal: AbortSignal.timeout(120_000), maxTurns: 1 });
if (typeof result.finalOutput !== 'string' || !result.finalOutput.trim()) throw new Error('Empty response');
console.log(result.finalOutput);
