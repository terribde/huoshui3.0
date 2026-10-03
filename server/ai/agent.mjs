import { Agent, run, setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled } from '@openai/agents';
import OpenAI from 'openai';

export function createAgent(env = process.env) {
  if (!env.LLM_API_KEY?.trim()) throw new Error('LLM_API_KEY is required');
  setTracingDisabled(true);
  setDefaultOpenAIClient(new OpenAI({
    apiKey: env.LLM_API_KEY,
    baseURL: env.LLM_BASE_URL || 'https://api.deepseek.com',
    timeout: 120_000,
    maxRetries: 0,
  }));
  setOpenAIAPI('chat_completions');
  return new Agent({
    name: '交大选课助手',
    model: env.LLM_MODEL || 'deepseek-flash',
    instructions: '你是西南交通大学选课助手，用简洁中文回答。当前未接入教师评价、课表、学校资料或任何查询工具。不得编造具体教师评价、评分、开课信息或引用；被问到这些信息时说明功能尚在接入中。不要输出内部思考过程。',
    modelSettings: {
      maxTokens: 4096,
      providerData: { thinking: { type: 'enabled' }, reasoning_effort: 'low' },
    },
  });
}

export { run };
