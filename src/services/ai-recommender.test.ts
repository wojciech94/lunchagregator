import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAIRecommenderService } from './ai-recommender';

beforeEach(() => vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'isolated-test-key'));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

function streamResponse(withError = false) {
  const text = { candidates: [{ content: { role: 'model', parts: [{ text: 'Polecam Margheritę.' }] }, ...(withError ? {} : { finishReason: 'STOP' }) }] };
  return new Response(`data: ${JSON.stringify(text)}\n\n${withError ? 'data: {"candidates":"invalid","error":{"code":429,"message":"Rate limit"}}\n\n' : ''}`, { headers: { 'content-type': 'text/event-stream' } });
}

it('switches the recommendation stream once on an initial HTTP 429', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 429 } }), { status: 429, headers: { 'content-type': 'application/json' } }))
    .mockResolvedValueOnce(streamResponse());
  const result = createAIRecommenderService().getRecommendations([{ role: 'user', content: 'Lunch?' }], []);
  let text = '';
  for await (const chunk of result.textStream) text += chunk;
  expect(text).toBe('Polecam Margheritę.');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(String(fetch.mock.calls[1][0])).toContain('gemini-3.1-flash-lite');
});

it('does not replay or mix models after any response text is delivered', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(streamResponse(true));
  const result = createAIRecommenderService().getRecommendations([{ role: 'user', content: 'Lunch?' }], []);
  const parts = [];
  for await (const part of result.fullStream) parts.push(part);
  expect(parts.some(part => part.type === 'text-delta')).toBe(true);
  expect(parts.some(part => part.type === 'error')).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});
