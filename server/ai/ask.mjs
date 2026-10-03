// Run on the server with: node --env-file=/etc/swjtu-ai.env ask.mjs '你好'
const prompt = process.argv.slice(2).join(' ').trim();
if (!prompt) throw new Error('请在命令后提供问题');
if (!process.env.AI_DEBUG_TOKEN) throw new Error('AI_DEBUG_TOKEN is required');
const response = await fetch(`http://127.0.0.1:3002/${process.env.AI_WEB_ENABLED === 'true' ? 'internal' : 'api'}/ai/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-debug-token': process.env.AI_DEBUG_TOKEN },
  body: JSON.stringify({ prompt }),
  signal: AbortSignal.timeout(130_000),
});
if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
const decoder = new TextDecoder();
let pending = '', done = false;
for await (const chunk of response.body) {
  pending += decoder.decode(chunk, { stream: true });
  let boundary;
  while ((boundary = pending.indexOf('\n\n')) >= 0) {
    const event = pending.slice(0, boundary);
    pending = pending.slice(boundary + 2);
    if (!event.startsWith('data: ')) continue;
    const data = event.slice(6);
    if (data === '[DONE]') { done = true; continue; }
    const message = JSON.parse(data);
    if (message.error) throw new Error(message.error);
    if (typeof message.t === 'string') process.stdout.write(message.t);
  }
}
process.stdout.write('\n');
if (!done) throw new Error('Stream ended without DONE');
