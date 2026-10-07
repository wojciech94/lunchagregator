import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeText } from './ai-analyzer';
import expected from '../../tests/fixtures/lunch-import/expected.json';

// Public, frozen menu excerpts only. Ordinary test runs make no provider calls.
describe.skipIf(process.env.RUN_AI_LIVE !== '1')('issue #94 captured source extraction', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(expected)('preserves reviewed dishes, prices and weekdays: $id', async (source) => {
    const text = readFileSync(new URL(`../../tests/fixtures/lunch-import/${source.id}.txt`, import.meta.url), 'utf8');
    const extraction = await analyzeText(text);
    const offers = extraction.offers.filter(offer =>
      offer.restaurantName?.toLowerCase().includes(source.id === 'sushi' ? 'sushi friends' : source.id)
    );
    if (process.env.AI_SOURCE_DIAGNOSTICS === '1') {
      console.info(JSON.stringify({ source: source.id, offers }));
    }
    expect(extraction.message, 'Provider failure is not an empty menu').toBeUndefined();
    expect(offers).toHaveLength(1);
    const dishes = offers.flatMap(offer => offer.dishes);
    const matched = new Set<number>();
    for (const expectedDish of source.dishes) {
      const index = dishes.findIndex((dish, index) => {
        if (matched.has(index) || dish.price !== expectedDish.price ||
          (dish.dayOfWeek ?? null) !== expectedDish.dayOfWeek) return false;
        const content = [dish.name, dish.description, ...(dish.items ?? [])].join(' ').toLowerCase();
        return expectedDish.terms.every(term => content.includes(term));
      });
      expect(index, `${source.id}: missing/changed ${expectedDish.label} (${expectedDish.price} PLN); preserve alternatives and set components`).toBeGreaterThanOrEqual(0);
      matched.add(index);
    }
    // PROST also lists a separate juice. No other invented/split rows qualify.
    const extra = dishes.filter((_, index) => !matched.has(index));
    if (source.id === 'prost') {
      expect(extra.every(dish => dish.price === 18 && /sok/i.test(dish.name ?? ''))).toBe(true);
      expect(extra.length).toBeLessThanOrEqual(1);
    } else {
      expect(extra).toHaveLength(0);
    }
    // Dates, surcharges and source conditions have no fields in the current
    // Extraction contract. Passing this test does not authorize publication.
  }, 35000);
});
