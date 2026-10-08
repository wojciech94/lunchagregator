import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { identifyRecommendationIntent } from './recommendation-search';

beforeEach(() => vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'isolated-test-key'));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it('extracts structured intent through the real SDK and preserves the shared signal on a single 429 fallback', async () => {
  const intent = {
    period: 'this_week', weekday: null, startDate: null, endDate: null, clarification: null,
    dietaryTags: [], cuisineTypes: [], minPrice: null, maxPrice: null,
  };
  const fetch = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 429 } }), {
      status: 429, headers: { 'content-type': 'application/json' },
    }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{
      content: { role: 'model', parts: [{ text: JSON.stringify(intent) }] }, finishReason: 'STOP',
    }] }), { headers: { 'content-type': 'application/json' } }));
  const signal = new AbortController().signal;
  const result = await identifyRecommendationIntent([
    { role: 'user', content: 'Co dla wegetarian w tym tygodniu?' },
    { role: 'assistant', content: 'Mam tylko oferty na dziś.' },
    { role: 'user', content: 'A coś z mięsem?' },
  ], '2026-10-08', signal);
  expect(result).toEqual(intent);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(String(fetch.mock.calls[1][0])).toContain('gemini-3.1-flash-lite');
  expect(fetch.mock.calls[0][1]?.signal).toBe(signal);
  expect(fetch.mock.calls[1][1]?.signal).toBe(signal);
  const body = JSON.parse(String(fetch.mock.calls[1][1]?.body));
  expect(body.contents.map((message: { parts: { text: string }[] }) => message.parts[0].text))
    .toEqual(['Co dla wegetarian w tym tygodniu?', 'Mam tylko oferty na dziś.', 'A coś z mięsem?']);
});
