import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeText, analyzeImage, analyzePdf } from './ai-analyzer';
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
    expect(fetch).toHaveBeenCalledTimes(status === 429 ? 2 : 1);
  });

  it('aborts the provider request at the shared 25-second deadline', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let signal: AbortSignal | null | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => {
      signal = options?.signal;
      return new Promise(() => {});
    });
    const pending = analyzeText('Lunch: Margherita, 34 zł.');
    await vi.advanceTimersByTimeAsync(24999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).message).toBe(EXTRACTION_ERROR_MESSAGES.timeout);
    expect(signal?.aborted).toBe(true);
  });

  function providerResponse(value: unknown) {
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(value) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 } }), { headers: { 'content-type': 'application/json' } });
  }

  it('sends exact PDF bytes through the Google SDK as an inline PDF, preserving null prices and availability', async () => {
    const bytes = Buffer.from('%PDF-1.7\nfixture');
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(providerResponse({
      offers: [{ restaurantName: 'Sushi Corner', dishes: [{ name: 'Lunch set I', price: null }] }], confidence: 0.9,
      availability: 'Monday–Friday 12–16',
    }));
    const result = await analyzePdf(bytes, 'Transcribe literally.');
    expect(result.offers[0].dishes[0].price).toBeNull();
    expect(result.availability).toBe('Monday–Friday 12–16');
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(body.contents[0].parts).toContainEqual({ inlineData: { mimeType: 'application/pdf', data: bytes.toString('base64') } });
    expect(JSON.stringify(body.systemInstruction)).toContain('Transcribe literally.');
  });

  it('sends downloaded image bytes and literal transcription instructions, retains stated availability', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(providerResponse({
      offers: [{ restaurantName: 'Meatologia', dishes: [{ name: 'Stek', price: 59 }] }], confidence: 0.9,
      availability: 'w dni robocze do 16:00',
    }));
    const result = await analyzeImage('data:image/jpeg;base64,/9j/2Q==', 'Transcribe dish names literally.');
    expect(result.availability).toBe('w dni robocze do 16:00');
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(body.contents[0].parts).toContainEqual({ inlineData: { mimeType: 'image/jpeg', data: '/9j/2Q==' } });
    expect(JSON.stringify(body.systemInstruction)).toContain('Transcribe dish names literally.');
  });

  it('uses 3.1 once after a primary 429 and preserves the extraction input', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 429, message: 'Rate limit', status: 'RESOURCE_EXHAUSTED' } }), { status: 429, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(providerResponse({ offers: [{ restaurantName: 'Pizza Si', dishes: [{ name: 'Margherita', price: 34 }] }], confidence: 0.9 }));
    const result = await analyzeText('Pizza Si. Margherita 34 PLN.');
    expect(result.message).toBeUndefined();
    expect(result.offers[0].dishes[0].price).toBe(34);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[0][0])).toContain('gemini-3.5-flash-lite');
    expect(String(fetch.mock.calls[1][0])).toContain('gemini-3.1-flash-lite');
    expect(fetch.mock.calls[1][1]?.body).toEqual(fetch.mock.calls[0][1]?.body);
  });

  it('does not give the fallback a new 25-second deadline', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let fallbackSignal: AbortSignal | null | undefined;
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(new Response(JSON.stringify({ error: { code: 429 } }), { status: 429, headers: { 'content-type': 'application/json' } })), 9000)))
      .mockImplementationOnce((_url, options) => { fallbackSignal = options?.signal; return new Promise(() => {}); });
    const pending = analyzeText('Lunch: Margherita 34 PLN.');
    await vi.advanceTimersByTimeAsync(9000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fallbackSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(15999);
    expect(fallbackSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).message).toBe(EXTRACTION_ERROR_MESSAGES.timeout);
    expect(fallbackSignal?.aborted).toBe(true);
  });

  it('allows fallback extraction to complete after the former ten-second cutoff', async () => {
    vi.useFakeTimers();
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(new Response(JSON.stringify({ error: { code: 429 } }), { status: 429, headers: { 'content-type': 'application/json' } })), 9000)))
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(providerResponse({
        offers: [{ restaurantName: 'Pizza Si', dishes: [{ name: 'Margherita', price: 34 }] }], confidence: 0.9,
      })), 6000)));
    const pending = analyzeText('Pizza Si. Margherita 34 PLN.');
    await vi.advanceTimersByTimeAsync(15000);
    const result = await pending;
    expect(result.message).toBeUndefined();
    expect(result.offers[0].dishes[0].price).toBe(34);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

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
