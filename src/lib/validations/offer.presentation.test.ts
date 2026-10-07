import { expect, it } from 'vitest';
import { createOfferSchema, updateOfferSchema } from './offer';
import { todayISO } from '@/utils/day-of-week';

const valid = { dishName: 'Pizza', restaurantName: 'Pizza Si', price: 34, availableDate: todayISO(), sourceType: 'text' };
it.each([undefined, NaN])('gives an actionable Polish price message for %s', (price) => {
  const result = createOfferSchema.safeParse({ ...valid, price });
  expect(result.success).toBe(false);
  if (!result.success) expect(result.error.flatten().fieldErrors.price).toEqual(['Podaj cenę w PLN.']);
});
it('retains price bounds and optional price in partial server updates', () => {
  expect(createOfferSchema.safeParse({ ...valid, price: 0 }).success).toBe(false);
  expect(createOfferSchema.safeParse({ ...valid, price: 10000 }).success).toBe(false);
  expect(updateOfferSchema.safeParse({ description: 'Nowy opis' }).success).toBe(true);
});
