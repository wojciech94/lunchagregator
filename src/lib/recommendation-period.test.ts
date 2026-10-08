import { describe, expect, it } from 'vitest';
import { periodDates, resolveRecommendationPeriod, shiftDate, warsawToday } from './recommendation-period';
import { recommendationIntentSchema, type RecommendationIntent } from './validations/chat';

const intentFixture: RecommendationIntent = {
  period: 'today', weekday: null, startDate: null, endDate: null, clarification: null,
  dietaryTags: [], cuisineTypes: [], minPrice: null, maxPrice: null,
};

describe('recommendation calendar', () => {
  it.each([
    ['2026-10-08T21:59:59Z', '2026-10-08'],
    ['2026-10-08T22:00:00Z', '2026-10-09'],
    ['2026-12-31T23:00:00Z', '2027-01-01'],
    ['2026-03-29T22:00:00Z', '2026-03-30'],
  ])('resolves Warsaw date at %s', (now, expected) => {
    expect(warsawToday(new Date(now))).toBe(expected);
  });

  it.each([
    ['today', '2026-10-08', '2026-10-08'],
    ['tomorrow', '2026-10-09', '2026-10-09'],
    ['this_week', '2026-10-08', '2026-10-11'],
    ['next_week', '2026-10-12', '2026-10-18'],
  ] as const)('resolves %s deterministically', (period, start, end) => {
    expect(resolveRecommendationPeriod({ ...intentFixture, period }, '2026-10-08').context?.period).toEqual({ start, end });
  });

  it('handles Sunday, same-day weekdays and year boundaries', () => {
    expect(resolveRecommendationPeriod({ ...intentFixture, period: 'this_week' }, '2026-10-11').context?.period)
      .toEqual({ start: '2026-10-11', end: '2026-10-11' });
    expect(resolveRecommendationPeriod({ ...intentFixture, period: 'weekday', weekday: 4 }, '2026-10-08').context?.period.start).toBe('2026-10-08');
    expect(resolveRecommendationPeriod({ ...intentFixture, period: 'weekday', weekday: 1 }, '2026-10-08').context?.period.start).toBe('2026-10-12');
    expect(resolveRecommendationPeriod({ ...intentFixture, period: 'next_week' }, '2026-12-31').context?.period)
      .toEqual({ start: '2027-01-04', end: '2027-01-10' });
  });

  it.each([
    ['2026-02-30', '2026-10-10'], ['2026-10-20', '2026-10-10'],
    ['2026-10-07', '2026-10-07'], ['2026-11-08', '2026-11-10'],
  ])('does not fall back to today for invalid/unsupported dates %s–%s', (startDate, endDate) => {
    const result = resolveRecommendationPeriod({ ...intentFixture, period: 'dates', startDate, endDate }, '2026-10-08');
    expect(result.message).toBeTruthy();
    expect(result.context).toBeUndefined();
  });

  it('clips partly supported ranges and includes both boundaries through day 30', () => {
    const result = resolveRecommendationPeriod({ ...intentFixture, period: 'dates', startDate: '2026-10-07', endDate: '2026-11-09' }, '2026-10-08');
    expect(result.context).toMatchObject({ clipped: true, period: { start: '2026-10-08', end: '2026-11-07' } });
    expect(periodDates(result.context!.period)).toHaveLength(31);
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('validates AI intent and returns clarification without searching', () => {
    expect(recommendationIntentSchema.safeParse({ ...intentFixture, weekday: 7 }).success).toBe(false);
    expect(resolveRecommendationPeriod({ ...intentFixture, period: 'clarify', clarification: 'Który tydzień?' }, '2026-10-08'))
      .toEqual({ message: 'Który tydzień?' });
  });
});
