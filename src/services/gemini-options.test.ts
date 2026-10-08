import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetModules(); });

it('extracts through the SDK when Flash-Lite rejects the legacy zero thinking budget', async () => {
  vi.resetModules();
  vi.stubEnv('AI_MODEL', 'gemini-3.5-flash-lite');
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'isolated-test-key');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    if (body.generationConfig?.thinkingConfig?.thinkingBudget === 0) {
      return new Response(JSON.stringify({ error: { code: 400, message: 'Request contains an invalid argument.', status: 'INVALID_ARGUMENT' } }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({
      offers: [{ restaurantName: 'Pizza Si', dishes: [{ name: 'Margherita', price: 34 }] }], confidence: 0.9,
    }) }] }, finishReason: 'STOP' }] }), { headers: { 'content-type': 'application/json' } });
  });
  const { analyzeText } = await import('./ai-analyzer');
  const result = await analyzeText('Pizza Si: Margherita 34 PLN.');
  expect(result.message).toBeUndefined();
  expect(result.offers[0].dishes[0].price).toBe(34);
  expect(fetch).toHaveBeenCalledTimes(1);
});
