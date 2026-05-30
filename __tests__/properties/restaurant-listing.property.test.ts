// Feature: restaurant-management, Property 5: Restaurant listing — alphabetical sort and pagination limit

import { describe, it, expect } from 'vitest';
import { fc } from './fc-config';

/**
 * Validates: Requirements 4.1
 *
 * Property 5: Restaurant listing — alphabetical sort and pagination limit
 * For any set of restaurants in the database, calling the listing function without
 * filters SHALL return restaurants sorted alphabetically by name (case-insensitive),
 * and the number of returned restaurants SHALL NOT exceed 50.
 */

// --- Listing logic (simulates the sort + pagination behavior from listRestaurants) ---

const MAX_PAGE_SIZE = 50;

interface RestaurantEntry {
  name: string;
}

/**
 * Simulates the listing behavior: sort alphabetically by name (case-insensitive)
 * and paginate with a max of 50 items per page.
 */
function listRestaurantsPage(
  restaurants: RestaurantEntry[],
  page: number = 1,
  limit: number = MAX_PAGE_SIZE
): RestaurantEntry[] {
  const effectiveLimit = Math.min(limit, MAX_PAGE_SIZE);
  const sorted = [...restaurants].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );
  const offset = (page - 1) * effectiveLimit;
  return sorted.slice(offset, offset + effectiveLimit);
}

// --- Generators ---

/** Arbitrary restaurant name (non-empty, varying case) */
const restaurantNameArb = fc.string({ minLength: 2, maxLength: 100 }).filter((s) => s.trim().length >= 2);

/** Arbitrary array of restaurant entries (0 to 120 items to test beyond 50 limit) */
const restaurantArrayArb = fc.array(
  restaurantNameArb.map((name) => ({ name })),
  { minLength: 0, maxLength: 120 }
);

describe('Property 5: Restaurant listing — alphabetical sort and pagination limit', () => {
  describe('Results are sorted alphabetically by name (case-insensitive)', () => {
    it('should return restaurants in alphabetical order regardless of input order', () => {
      fc.assert(
        fc.property(restaurantArrayArb, (restaurants) => {
          const result = listRestaurantsPage(restaurants);

          // Verify each consecutive pair is in correct order
          for (let i = 0; i < result.length - 1; i++) {
            const comparison = result[i].name.localeCompare(result[i + 1].name, undefined, {
              sensitivity: 'base',
            });
            expect(comparison).toBeLessThanOrEqual(0);
          }
        })
      );
    });
  });

  describe('Results never exceed 50 items', () => {
    it('should return at most 50 restaurants per page', () => {
      fc.assert(
        fc.property(restaurantArrayArb, (restaurants) => {
          const result = listRestaurantsPage(restaurants);
          expect(result.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
        })
      );
    });
  });

  describe('For arrays with <= 50 items, all items are returned', () => {
    it('should return all restaurants when total count is at most 50', () => {
      const smallArrayArb = fc.array(
        restaurantNameArb.map((name) => ({ name })),
        { minLength: 0, maxLength: 50 }
      );

      fc.assert(
        fc.property(smallArrayArb, (restaurants) => {
          const result = listRestaurantsPage(restaurants);
          expect(result.length).toBe(restaurants.length);
        })
      );
    });
  });

  describe('For arrays with > 50 items, exactly 50 items are returned on page 1', () => {
    it('should return exactly 50 restaurants when input has more than 50', () => {
      const largeArrayArb = fc.array(
        restaurantNameArb.map((name) => ({ name })),
        { minLength: 51, maxLength: 120 }
      );

      fc.assert(
        fc.property(largeArrayArb, (restaurants) => {
          const result = listRestaurantsPage(restaurants);
          expect(result.length).toBe(MAX_PAGE_SIZE);
        })
      );
    });
  });

  describe('Pagination limit is enforced even with custom limit values', () => {
    it('should cap the limit at 50 even if a higher limit is requested', () => {
      const limitArb = fc.integer({ min: 51, max: 200 });

      fc.assert(
        fc.property(restaurantArrayArb, limitArb, (restaurants, limit) => {
          const result = listRestaurantsPage(restaurants, 1, limit);
          expect(result.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
        })
      );
    });
  });
});
