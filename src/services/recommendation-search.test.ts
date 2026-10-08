import { beforeEach, expect, it, vi } from 'vitest';
import { generateObject } from 'ai';
import { identifyRecommendationIntent, searchRecommendationOffers } from './recommendation-search';
import { listOffers } from './offers';
import { resolveRecommendationPeriod } from '@/lib/recommendation-period';
import type { RecommendationIntent } from '@/lib/validations/chat';
import type { LunchOfferWithDistance } from '@/types/offers';

vi.mock('ai', async original => ({ ...await original<typeof import('ai')>(), generateObject: vi.fn() }));
vi.mock('./offers', () => ({ listOffers: vi.fn() }));
const intent: RecommendationIntent = {
  period: 'this_week', weekday: null, startDate: null, endDate: null, clarification: null,
  dietaryTags: [], cuisineTypes: [], minPrice: null, maxPrice: null,
};
const signal = new AbortController().signal;
beforeEach(() => vi.resetAllMocks());

it('passes conversational follow-ups and one shared deadline to structured intent extraction', async () => {
  vi.mocked(generateObject).mockResolvedValue({ object: intent } as unknown as Awaited<ReturnType<typeof generateObject>>);
  const messages = [
    { role: 'user' as const, content: 'Co dla wegetarian w tym tygodniu?' },
    { role: 'assistant' as const, content: 'Mam tylko oferty na dziś.' },
    { role: 'user' as const, content: 'A coś z mięsem?' },
  ];
  expect(await identifyRecommendationIntent(messages, '2026-10-08', signal)).toEqual(intent);
  expect(generateObject).toHaveBeenCalledWith(expect.objectContaining({ messages, abortSignal: signal, maxRetries: 0 }));
  const system = vi.mocked(generateObject).mock.calls[0][0].system;
  expect(system).toContain('2026-10-08');
  expect(system).toContain('Keep the last user-selected period');
  expect(system).toContain('A request for meat replaces vegetarian/vegan');
});

it('fetches each inclusive date and discovers an offer beyond the original first page', async () => {
  vi.mocked(listOffers).mockImplementation(async filters => {
    const rows = Array.from({ length: filters.date === '2026-10-09' ? 61 : 1 }, (_, i) => ({
      id: `${filters.date}-${i}`, availableDate: filters.date,
      dishName: i === 60 ? 'Kurczak' : 'Pizza',
    } as LunchOfferWithDistance));
    const start = ((filters.page ?? 1) - 1) * 50;
    return { offers: rows.slice(start, start + 50), hasMore: start + 50 < rows.length, total: rows.length, limit: 50, page: filters.page ?? 1 };
  });
  const context = resolveRecommendationPeriod(intent, '2026-10-08').context!;
  const result = await searchRecommendationOffers(context, intent, undefined, signal);
  expect(result.offers.find(row => row.dishName === 'Kurczak')?.availableDate).toBe('2026-10-09');
  expect(result.offers.every(row => row.availableDate >= '2026-10-08' && row.availableDate <= '2026-10-11')).toBe(true);
  expect(result.context.incompleteDates).toEqual([]);
  expect(listOffers).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-10-09', page: 2 }), undefined, signal);
});

it('filters before paging, bounds context fairly across dates and discloses truncation', async () => {
  vi.mocked(listOffers).mockImplementation(async filters => ({
    offers: Array.from({ length: 50 }, (_, i) => ({ id: `${filters.date}-${filters.page}-${i}`, availableDate: filters.date } as LunchOfferWithDistance)),
    hasMore: true, total: 10000, limit: 50, page: filters.page ?? 1,
  }));
  const context = resolveRecommendationPeriod({ ...intent, period: 'dates', startDate: '2026-10-08', endDate: '2026-11-07' }, '2026-10-08').context!;
  const criteria = { ...intent, dietaryTags: ['vegan' as const], maxPrice: 35 };
  const result = await searchRecommendationOffers(context, criteria, undefined, signal);
  expect(result.offers.length).toBeLessThanOrEqual(1000);
  expect(result.context.incompleteDates).toHaveLength(31);
  expect(new Set(result.offers.map(row => row.availableDate)).size).toBe(31);
  expect(listOffers).toHaveBeenCalledWith(expect.objectContaining({ dietaryTags: ['vegan'], price: { min: 0, max: 35 } }), undefined, signal);
  expect(listOffers).toHaveBeenCalledTimes(31);
});

it('propagates query failures and stops work when aborted', async () => {
  const context = resolveRecommendationPeriod(intent, '2026-10-08').context!;
  vi.mocked(listOffers).mockRejectedValue(new Error('database unavailable'));
  await expect(searchRecommendationOffers(context, intent, undefined, signal)).rejects.toThrow('database unavailable');
  vi.clearAllMocks();
  await expect(searchRecommendationOffers(context, intent, undefined, AbortSignal.abort())).rejects.toThrow();
  expect(listOffers).not.toHaveBeenCalled();
});
