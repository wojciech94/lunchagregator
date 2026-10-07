import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeText } from './ai-analyzer';
import { EXTRACTION_ERROR_MESSAGES } from '@/lib/ai/extraction-errors';
import { validateExtraction } from '@/lib/validations/extraction';

beforeEach(() => vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'isolated-test-key'));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('extraction provider boundary', () => {
  it.each([
    [429, EXTRACTION_ERROR_MESSAGES.rateLimit],
    [503, EXTRACTION_ERROR_MESSAGES.unavailable],
    [400, EXTRACTION_ERROR_MESSAGES.configuration],
  ] as const)('reports HTTP %i as a service failure, not no offers', async (status, message) => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: { code: status, message: 'Provider rejected the request', status: 'UNAVAILABLE' },
    }), { status, headers: { 'content-type': 'application/json' } }));
    const pending = analyzeText('Restauracja: Pizza Si. Lunch: Margherita, 34 zł.');
    await vi.advanceTimersByTimeAsync(10000);
    expect((await pending).message).toBe(message);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('aborts the provider request at the ten-second deadline', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let signal: AbortSignal | null | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => {
      signal = options?.signal;
      return new Promise(() => {});
    });
    const pending = analyzeText('Lunch: Margherita, 34 zł.');
    await vi.advanceTimersByTimeAsync(9999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).message).toBe(EXTRACTION_ERROR_MESSAGES.timeout);
    expect(signal?.aborted).toBe(true);
  });

  function providerResponse(value: unknown) {
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(value) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 } }), { headers: { 'content-type': 'application/json' } });
  }

  it('distinguishes invalid structured output from a successful empty analysis', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetch = vi.spyOn(globalThis, 'fetch');
    fetch.mockResolvedValueOnce(providerResponse({ offers: 'invalid', confidence: 1 }));
    expect((await analyzeText('Lunch')).message).toBe(EXTRACTION_ERROR_MESSAGES.invalidOutput);
    fetch.mockResolvedValueOnce(providerResponse({ offers: [], confidence: 0 }));
    const empty = await analyzeText('No lunch menu');
    expect(empty.offers).toEqual([]);
    expect(empty.message).toBeUndefined();
  });

  it('passes structured menu data through the actual SDK and extraction validator', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(providerResponse({
      offers: [{ restaurantName: 'Pizza Si', address: 'Wrocław', dishes: [{ name: 'Margherita + lemoniada', price: 34, items: ['Margherita', 'lemoniada'] }] }], confidence: 0.9,
    }));
    const result = validateExtraction(await analyzeText('Restauracja Pizza Si. Margherita + lemoniada 34 zł.'));
    expect(result.validOffers).toHaveLength(1);
    expect(result.validOffers[0].dishes[0].price).toBe(34);
  });
});
