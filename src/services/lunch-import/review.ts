import { createHash } from 'node:crypto';
import type { ImportSource } from '@/lib/lunch-import/sources';
import type { LunchImportPreview } from '@/lib/lunch-import/types';

/** Stable retry identity comes from literal titles, never AI output or reviewed edits. */
export function createImportReview(source: ImportSource, fetchedAt: string, dishes: LunchImportPreview['dishes']) {
  if (!dishes.length || dishes.length > 50 || dishes.some(dish => !dish.name?.trim())) return null;
  const reviewDishes = dishes.map(dish => ({ ...dish, itemKey: createHash('sha256')
    .update(dish.name!.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pl')).digest('hex') }));
  if (new Set(reviewDishes.map(dish => dish.itemKey)).size !== reviewDishes.length) return null;
  return { sourceId: source.id, restaurantId: source.restaurantId, fetchedAt, dishes: reviewDishes };
}
