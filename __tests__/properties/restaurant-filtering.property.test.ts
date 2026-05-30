// Feature: restaurant-management, Property 6: Distance filter invariant for restaurants

import { describe, it, expect } from 'vitest';
import { fc } from './fc-config';

/**
 * Validates: Requirements 5.1
 *
 * Property 6: Distance filter invariant for restaurants
 * For any set of restaurants with locations, any user location, and any radius
 * value between 0.5 and 25 km, all restaurants returned by the distance filter
 * SHALL have a straight-line distance from the user location that is less than
 * or equal to the specified radius.
 */

// --- Types ---

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface RestaurantWithLocation {
  id: string;
  name: string;
  location: Coordinates;
}

// --- Haversine distance calculation ---

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculates the straight-line (great-circle) distance between two points
 * on Earth using the Haversine formula.
 * Returns distance in kilometers.
 */
function haversineDistance(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Filters restaurants by distance from a user location within a given radius.
 * Returns only restaurants whose haversine distance is <= radius.
 */
function filterByDistance(
  restaurants: RestaurantWithLocation[],
  userLocation: Coordinates,
  radiusKm: number
): RestaurantWithLocation[] {
  return restaurants.filter((restaurant) => {
    const distance = haversineDistance(userLocation, restaurant.location);
    return distance <= radiusKm;
  });
}

// --- Generators ---

/** Arbitrary valid latitude (-90 to 90) */
const latitudeArb = fc.double({ min: -90, max: 90, noNaN: true });

/** Arbitrary valid longitude (-180 to 180) */
const longitudeArb = fc.double({ min: -180, max: 180, noNaN: true });

/** Arbitrary coordinates */
const coordinatesArb = fc.record({
  latitude: latitudeArb,
  longitude: longitudeArb,
});

/** Arbitrary restaurant with location */
const restaurantWithLocationArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 2, maxLength: 100 }).filter((s) => s.trim().length >= 2),
  location: coordinatesArb,
});

/** Arbitrary array of restaurants with locations (1 to 30 items) */
const restaurantArrayArb = fc.array(restaurantWithLocationArb, { minLength: 1, maxLength: 30 });

/** Arbitrary radius between 0.5 and 25 km */
const radiusArb = fc.double({ min: 0.5, max: 25, noNaN: true });

describe('Property 6: Distance filter invariant for restaurants', () => {
  describe('All returned restaurants are within the specified radius', () => {
    it('should only return restaurants whose haversine distance from user location is <= radius', () => {
      fc.assert(
        fc.property(restaurantArrayArb, coordinatesArb, radiusArb, (restaurants, userLocation, radius) => {
          const result = filterByDistance(restaurants, userLocation, radius);

          // Verify every returned restaurant is within the radius
          for (const restaurant of result) {
            const distance = haversineDistance(userLocation, restaurant.location);
            expect(distance).toBeLessThanOrEqual(radius);
          }
        })
      );
    });
  });

  describe('No restaurant outside the radius is included in results', () => {
    it('should exclude all restaurants whose distance exceeds the radius', () => {
      fc.assert(
        fc.property(restaurantArrayArb, coordinatesArb, radiusArb, (restaurants, userLocation, radius) => {
          const result = filterByDistance(restaurants, userLocation, radius);
          const resultIds = new Set(result.map((r) => r.id));

          // Verify restaurants NOT in the result are indeed outside the radius
          for (const restaurant of restaurants) {
            if (!resultIds.has(restaurant.id)) {
              const distance = haversineDistance(userLocation, restaurant.location);
              expect(distance).toBeGreaterThan(radius);
            }
          }
        })
      );
    });
  });

  describe('Result is always a subset of the input', () => {
    it('should never return more restaurants than the input set', () => {
      fc.assert(
        fc.property(restaurantArrayArb, coordinatesArb, radiusArb, (restaurants, userLocation, radius) => {
          const result = filterByDistance(restaurants, userLocation, radius);
          expect(result.length).toBeLessThanOrEqual(restaurants.length);
        })
      );
    });
  });

  describe('Zero-distance case: restaurant at user location is always included', () => {
    it('should always include a restaurant located exactly at the user position', () => {
      fc.assert(
        fc.property(coordinatesArb, radiusArb, (userLocation, radius) => {
          const restaurantAtUserLocation: RestaurantWithLocation = {
            id: 'at-user-location',
            name: 'Test Restaurant',
            location: { ...userLocation },
          };

          const result = filterByDistance([restaurantAtUserLocation], userLocation, radius);
          expect(result.length).toBe(1);
          expect(result[0].id).toBe('at-user-location');
        })
      );
    });
  });
});

// Feature: restaurant-management, Property 7: Price level filter (OR logic)

/**
 * Validates: Requirements 5.2
 *
 * Property 7: Price level filter (OR logic)
 * For any set of restaurants and any non-empty subset of price levels,
 * all restaurants returned by the price level filter SHALL have a `price_level`
 * that is a member of the selected subset.
 */

// --- Types for Property 7 ---

type PriceLevel = 'budżetowa' | 'średnia' | 'premium';

interface RestaurantWithPriceLevel {
  id: string;
  name: string;
  price_level: PriceLevel | null;
}

// --- Filter function ---

/**
 * Filters restaurants by price level using OR logic.
 * Returns restaurants whose price_level is a member of the selected subset.
 * Restaurants with null price_level are excluded.
 */
function filterByPriceLevel(
  restaurants: RestaurantWithPriceLevel[],
  selectedLevels: PriceLevel[]
): RestaurantWithPriceLevel[] {
  return restaurants.filter(
    (restaurant) =>
      restaurant.price_level !== null &&
      selectedLevels.includes(restaurant.price_level)
  );
}

// --- Generators for Property 7 ---

const allPriceLevels: PriceLevel[] = ['budżetowa', 'średnia', 'premium'];

/** Arbitrary price level (including null for restaurants without price level) */
const priceLevelOrNullArb: fc.Arbitrary<PriceLevel | null> = fc.oneof(
  fc.constant<PriceLevel>('budżetowa'),
  fc.constant<PriceLevel>('średnia'),
  fc.constant<PriceLevel>('premium'),
  fc.constant(null)
);

/** Arbitrary restaurant with price level */
const restaurantWithPriceLevelArb: fc.Arbitrary<RestaurantWithPriceLevel> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 2, maxLength: 100 }).filter((s) => s.trim().length >= 2),
  price_level: priceLevelOrNullArb,
});

/** Arbitrary array of restaurants (1 to 30 items) */
const restaurantPriceLevelArrayArb = fc.array(restaurantWithPriceLevelArb, {
  minLength: 1,
  maxLength: 30,
});

/** Arbitrary non-empty subset of price levels */
const priceLevelSubsetArb: fc.Arbitrary<PriceLevel[]> = fc
  .subarray(allPriceLevels, { minLength: 1, maxLength: 3 })
  .filter((arr) => arr.length > 0);

describe('Property 7: Price level filter (OR logic)', () => {
  describe('All returned restaurants have a price_level in the selected subset', () => {
    it('should only return restaurants whose price_level is a member of the selected price levels', () => {
      fc.assert(
        fc.property(
          restaurantPriceLevelArrayArb,
          priceLevelSubsetArb,
          (restaurants, selectedLevels) => {
            const result = filterByPriceLevel(restaurants, selectedLevels);

            // Verify every returned restaurant has a price_level in the selected subset
            for (const restaurant of result) {
              expect(restaurant.price_level).not.toBeNull();
              expect(selectedLevels).toContain(restaurant.price_level);
            }
          }
        )
      );
    });
  });

  describe('Restaurants NOT in the result either have null price_level or a price_level not in the subset', () => {
    it('should exclude restaurants with null price_level or price_level outside the selected subset', () => {
      fc.assert(
        fc.property(
          restaurantPriceLevelArrayArb,
          priceLevelSubsetArb,
          (restaurants, selectedLevels) => {
            const result = filterByPriceLevel(restaurants, selectedLevels);
            const resultIds = new Set(result.map((r) => r.id));

            // Verify restaurants NOT in the result have null price_level or price_level not in subset
            for (const restaurant of restaurants) {
              if (!resultIds.has(restaurant.id)) {
                const hasNullPriceLevel = restaurant.price_level === null;
                const hasPriceLevelOutsideSubset =
                  restaurant.price_level !== null &&
                  !selectedLevels.includes(restaurant.price_level);

                expect(hasNullPriceLevel || hasPriceLevelOutsideSubset).toBe(true);
              }
            }
          }
        )
      );
    });
  });

  describe('Result is always a subset of the input', () => {
    it('should never return more restaurants than the input set', () => {
      fc.assert(
        fc.property(
          restaurantPriceLevelArrayArb,
          priceLevelSubsetArb,
          (restaurants, selectedLevels) => {
            const result = filterByPriceLevel(restaurants, selectedLevels);
            expect(result.length).toBeLessThanOrEqual(restaurants.length);
          }
        )
      );
    });
  });

  describe('Selecting all price levels returns all restaurants with non-null price_level', () => {
    it('should return every restaurant that has a non-null price_level when all levels are selected', () => {
      fc.assert(
        fc.property(restaurantPriceLevelArrayArb, (restaurants) => {
          const result = filterByPriceLevel(restaurants, allPriceLevels);
          const expectedCount = restaurants.filter((r) => r.price_level !== null).length;
          expect(result.length).toBe(expectedCount);
        })
      );
    });
  });
});

// Feature: restaurant-management, Property 8: Cuisine type filter (OR logic)

/**
 * Validates: Requirements 5.3
 *
 * Property 8: Cuisine type filter (OR logic)
 * For any set of restaurants and any non-empty subset of cuisine types,
 * all restaurants returned by the cuisine filter SHALL have at least one
 * `cuisine_type` that is a member of the selected subset.
 */

// --- Types for Property 8 ---

type CuisineType = 'polska' | 'wloska' | 'azjatycka' | 'meksykanska' | 'amerykanska' | 'indyjska' | 'srodziemnomorska' | 'inne';

interface RestaurantWithCuisine {
  id: string;
  name: string;
  cuisine_types: CuisineType[];
}

// --- Filter function ---

/**
 * Filters restaurants by cuisine type using OR logic.
 * Returns restaurants that have at least one cuisine_type in the selected subset.
 * Restaurants with empty cuisine_types array are excluded.
 */
function filterByCuisineType(
  restaurants: RestaurantWithCuisine[],
  selectedCuisines: CuisineType[]
): RestaurantWithCuisine[] {
  return restaurants.filter(
    (restaurant) =>
      restaurant.cuisine_types.length > 0 &&
      restaurant.cuisine_types.some((ct) => selectedCuisines.includes(ct))
  );
}

// --- Generators for Property 8 ---

const allCuisineTypes: CuisineType[] = [
  'polska', 'wloska', 'azjatycka', 'meksykanska',
  'amerykanska', 'indyjska', 'srodziemnomorska', 'inne',
];

/** Arbitrary non-empty array of cuisine types (1 to 4 items, no duplicates) */
const cuisineTypesArrayArb: fc.Arbitrary<CuisineType[]> = fc
  .subarray(allCuisineTypes, { minLength: 0, maxLength: 4 });

/** Arbitrary restaurant with cuisine types */
const restaurantWithCuisineArb: fc.Arbitrary<RestaurantWithCuisine> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 2, maxLength: 100 }).filter((s) => s.trim().length >= 2),
  cuisine_types: cuisineTypesArrayArb,
});

/** Arbitrary array of restaurants (1 to 30 items) */
const restaurantCuisineArrayArb = fc.array(restaurantWithCuisineArb, {
  minLength: 1,
  maxLength: 30,
});

/** Arbitrary non-empty subset of cuisine types to filter by */
const cuisineSubsetArb: fc.Arbitrary<CuisineType[]> = fc
  .subarray(allCuisineTypes, { minLength: 1, maxLength: 8 })
  .filter((arr) => arr.length > 0);

describe('Property 8: Cuisine type filter (OR logic)', () => {
  describe('All returned restaurants have at least one cuisine_type in the selected subset', () => {
    it('should only return restaurants with at least one matching cuisine type', () => {
      fc.assert(
        fc.property(
          restaurantCuisineArrayArb,
          cuisineSubsetArb,
          (restaurants, selectedCuisines) => {
            const result = filterByCuisineType(restaurants, selectedCuisines);

            // Verify every returned restaurant has at least one cuisine_type in the selected subset
            for (const restaurant of result) {
              const hasMatch = restaurant.cuisine_types.some((ct) =>
                selectedCuisines.includes(ct)
              );
              expect(hasMatch).toBe(true);
            }
          }
        )
      );
    });
  });

  describe('Restaurants NOT in the result have no cuisine types in the selected subset', () => {
    it('should exclude restaurants with empty cuisine_types or no overlap with selected subset', () => {
      fc.assert(
        fc.property(
          restaurantCuisineArrayArb,
          cuisineSubsetArb,
          (restaurants, selectedCuisines) => {
            const result = filterByCuisineType(restaurants, selectedCuisines);
            const resultIds = new Set(result.map((r) => r.id));

            // Verify restaurants NOT in the result have no cuisine types in the selected subset
            for (const restaurant of restaurants) {
              if (!resultIds.has(restaurant.id)) {
                const hasOverlap = restaurant.cuisine_types.some((ct) =>
                  selectedCuisines.includes(ct)
                );
                expect(hasOverlap).toBe(false);
              }
            }
          }
        )
      );
    });
  });

  describe('Result is always a subset of the input', () => {
    it('should never return more restaurants than the input set', () => {
      fc.assert(
        fc.property(
          restaurantCuisineArrayArb,
          cuisineSubsetArb,
          (restaurants, selectedCuisines) => {
            const result = filterByCuisineType(restaurants, selectedCuisines);
            expect(result.length).toBeLessThanOrEqual(restaurants.length);
          }
        )
      );
    });
  });

  describe('Selecting all cuisine types returns all restaurants with non-empty cuisine_types', () => {
    it('should return every restaurant that has at least one cuisine type when all types are selected', () => {
      fc.assert(
        fc.property(restaurantCuisineArrayArb, (restaurants) => {
          const result = filterByCuisineType(restaurants, allCuisineTypes);
          const expectedCount = restaurants.filter((r) => r.cuisine_types.length > 0).length;
          expect(result.length).toBe(expectedCount);
        })
      );
    });
  });
});


// Feature: restaurant-management, Property 9: Lunch hours time containment filter

/**
 * Validates: Requirements 5.4
 *
 * Property 9: Lunch hours time containment filter
 * For any set of restaurants with lunch hours and any query time in HH:MM format,
 * all restaurants returned by the lunch hours filter SHALL have
 * `lunch_hours_start <= query_time` AND `lunch_hours_end >= query_time`.
 */

// --- Types for Property 9 ---

interface LunchHours {
  start: string; // HH:MM format
  end: string;   // HH:MM format
}

interface RestaurantWithLunchHours {
  id: string;
  name: string;
  lunch_hours: LunchHours | null;
}

// --- Filter function ---

/**
 * Filters restaurants by lunch hours time containment.
 * Returns restaurants whose lunch hours contain the query time
 * (start <= queryTime AND end >= queryTime).
 * Restaurants with null lunch_hours are excluded.
 */
function filterByLunchHours(
  restaurants: RestaurantWithLunchHours[],
  queryTime: string
): RestaurantWithLunchHours[] {
  return restaurants.filter(
    (restaurant) =>
      restaurant.lunch_hours !== null &&
      restaurant.lunch_hours.start <= queryTime &&
      restaurant.lunch_hours.end >= queryTime
  );
}

// --- Generators for Property 9 ---

/**
 * Generates a valid HH:MM time string.
 * Hours: 00-23, Minutes: 00-59
 */
const timeArb: fc.Arbitrary<string> = fc
  .record({
    hour: fc.integer({ min: 0, max: 23 }),
    minute: fc.integer({ min: 0, max: 59 }),
  })
  .map(({ hour, minute }) => {
    const hh = hour.toString().padStart(2, '0');
    const mm = minute.toString().padStart(2, '0');
    return `${hh}:${mm}`;
  });

/**
 * Generates valid lunch hours where start < end.
 * Start: 06:00-18:00, End: 07:00-23:00, with start < end guaranteed.
 */
const lunchHoursArb: fc.Arbitrary<LunchHours> = fc
  .record({
    startHour: fc.integer({ min: 6, max: 18 }),
    startMinute: fc.integer({ min: 0, max: 59 }),
    endHour: fc.integer({ min: 7, max: 23 }),
    endMinute: fc.integer({ min: 0, max: 59 }),
  })
  .filter(({ startHour, startMinute, endHour, endMinute }) => {
    const start = `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`;
    const end = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
    return start < end;
  })
  .map(({ startHour, startMinute, endHour, endMinute }) => ({
    start: `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`,
    end: `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`,
  }));

/** Arbitrary lunch hours or null */
const lunchHoursOrNullArb: fc.Arbitrary<LunchHours | null> = fc.oneof(
  lunchHoursArb,
  fc.constant(null)
);

/** Arbitrary restaurant with lunch hours */
const restaurantWithLunchHoursArb: fc.Arbitrary<RestaurantWithLunchHours> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 2, maxLength: 100 }).filter((s) => s.trim().length >= 2),
  lunch_hours: lunchHoursOrNullArb,
});

/** Arbitrary array of restaurants (1 to 30 items) */
const restaurantLunchHoursArrayArb = fc.array(restaurantWithLunchHoursArb, {
  minLength: 1,
  maxLength: 30,
});

/** Arbitrary query time in HH:MM format */
const queryTimeArb = timeArb;

describe('Property 9: Lunch hours time containment filter', () => {
  describe('All returned restaurants have lunch hours containing the query time', () => {
    it('should only return restaurants where start <= queryTime AND end >= queryTime', () => {
      fc.assert(
        fc.property(
          restaurantLunchHoursArrayArb,
          queryTimeArb,
          (restaurants, queryTime) => {
            const result = filterByLunchHours(restaurants, queryTime);

            // Verify every returned restaurant has lunch hours containing the query time
            for (const restaurant of result) {
              expect(restaurant.lunch_hours).not.toBeNull();
              expect(restaurant.lunch_hours!.start <= queryTime).toBe(true);
              expect(restaurant.lunch_hours!.end >= queryTime).toBe(true);
            }
          }
        )
      );
    });
  });

  describe('Restaurants NOT in the result either have null lunch hours or hours that do not contain the query time', () => {
    it('should exclude restaurants with null lunch hours or whose hours do not contain the query time', () => {
      fc.assert(
        fc.property(
          restaurantLunchHoursArrayArb,
          queryTimeArb,
          (restaurants, queryTime) => {
            const result = filterByLunchHours(restaurants, queryTime);
            const resultIds = new Set(result.map((r) => r.id));

            // Verify restaurants NOT in the result have null lunch hours or don't contain query time
            for (const restaurant of restaurants) {
              if (!resultIds.has(restaurant.id)) {
                const hasNullHours = restaurant.lunch_hours === null;
                const doesNotContainTime =
                  restaurant.lunch_hours !== null &&
                  (restaurant.lunch_hours.start > queryTime ||
                    restaurant.lunch_hours.end < queryTime);

                expect(hasNullHours || doesNotContainTime).toBe(true);
              }
            }
          }
        )
      );
    });
  });

  describe('Result is always a subset of the input', () => {
    it('should never return more restaurants than the input set', () => {
      fc.assert(
        fc.property(
          restaurantLunchHoursArrayArb,
          queryTimeArb,
          (restaurants, queryTime) => {
            const result = filterByLunchHours(restaurants, queryTime);
            expect(result.length).toBeLessThanOrEqual(restaurants.length);
          }
        )
      );
    });
  });

  describe('Restaurant with query time exactly at start boundary is included', () => {
    it('should include a restaurant when queryTime equals lunch_hours_start', () => {
      fc.assert(
        fc.property(lunchHoursArb, (lunchHours) => {
          const restaurant: RestaurantWithLunchHours = {
            id: 'boundary-start',
            name: 'Boundary Test',
            lunch_hours: lunchHours,
          };

          const result = filterByLunchHours([restaurant], lunchHours.start);
          expect(result.length).toBe(1);
          expect(result[0].id).toBe('boundary-start');
        })
      );
    });
  });

  describe('Restaurant with query time exactly at end boundary is included', () => {
    it('should include a restaurant when queryTime equals lunch_hours_end', () => {
      fc.assert(
        fc.property(lunchHoursArb, (lunchHours) => {
          const restaurant: RestaurantWithLunchHours = {
            id: 'boundary-end',
            name: 'Boundary Test',
            lunch_hours: lunchHours,
          };

          const result = filterByLunchHours([restaurant], lunchHours.end);
          expect(result.length).toBe(1);
          expect(result[0].id).toBe('boundary-end');
        })
      );
    });
  });
});


// Feature: restaurant-management, Property 10: Text search containment for restaurants

/**
 * Validates: Requirements 5.5
 *
 * Property 10: Text search containment for restaurants
 * For any set of restaurants and any search query of at least 2 characters,
 * all restaurants returned by the search function SHALL have either `name` or
 * `description` containing the query text (case-insensitive partial match).
 */

// --- Types for Property 10 ---

interface RestaurantWithDescription {
  id: string;
  name: string;
  description: string | null;
}

// --- Filter function ---

/**
 * Filters restaurants by text search (case-insensitive partial match).
 * Returns restaurants where name or description contains the query text.
 * Query must be at least 2 characters.
 */
function filterByTextSearch(
  restaurants: RestaurantWithDescription[],
  query: string
): RestaurantWithDescription[] {
  if (query.length < 2) return [];
  const lowerQuery = query.toLowerCase();
  return restaurants.filter(
    (restaurant) =>
      restaurant.name.toLowerCase().includes(lowerQuery) ||
      (restaurant.description !== null &&
        restaurant.description.toLowerCase().includes(lowerQuery))
  );
}

// --- Generators for Property 10 ---

/** Arbitrary restaurant name (2 to 100 characters) */
const restaurantNameArb = fc
  .string({ minLength: 2, maxLength: 100 })
  .filter((s) => s.trim().length >= 2);

/** Arbitrary restaurant description (null or up to 500 characters) */
const restaurantDescriptionArb: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant(null),
  fc.string({ minLength: 0, maxLength: 200 })
);

/** Arbitrary restaurant with name and description */
const restaurantWithDescriptionArb: fc.Arbitrary<RestaurantWithDescription> = fc.record({
  id: fc.uuid(),
  name: restaurantNameArb,
  description: restaurantDescriptionArb,
});

/** Arbitrary array of restaurants (1 to 30 items) */
const restaurantTextSearchArrayArb = fc.array(restaurantWithDescriptionArb, {
  minLength: 1,
  maxLength: 30,
});

/** Arbitrary search query (min 2 characters, max 50 characters) */
const searchQueryArb = fc
  .string({ minLength: 2, maxLength: 50 })
  .filter((s) => s.trim().length >= 2);

describe('Property 10: Text search containment for restaurants', () => {
  describe('All returned restaurants have name or description containing the query (case-insensitive)', () => {
    it('should only return restaurants where name or description contains the query text', () => {
      fc.assert(
        fc.property(
          restaurantTextSearchArrayArb,
          searchQueryArb,
          (restaurants, query) => {
            const result = filterByTextSearch(restaurants, query);
            const lowerQuery = query.toLowerCase();

            // Verify every returned restaurant has name or description containing the query
            for (const restaurant of result) {
              const nameContains = restaurant.name.toLowerCase().includes(lowerQuery);
              const descContains =
                restaurant.description !== null &&
                restaurant.description.toLowerCase().includes(lowerQuery);
              expect(nameContains || descContains).toBe(true);
            }
          }
        )
      );
    });
  });

  describe('Restaurants NOT in the result do not contain the query in name or description', () => {
    it('should exclude restaurants where neither name nor description contains the query', () => {
      fc.assert(
        fc.property(
          restaurantTextSearchArrayArb,
          searchQueryArb,
          (restaurants, query) => {
            const result = filterByTextSearch(restaurants, query);
            const resultIds = new Set(result.map((r) => r.id));
            const lowerQuery = query.toLowerCase();

            // Verify restaurants NOT in the result don't contain the query in either field
            for (const restaurant of restaurants) {
              if (!resultIds.has(restaurant.id)) {
                const nameContains = restaurant.name.toLowerCase().includes(lowerQuery);
                const descContains =
                  restaurant.description !== null &&
                  restaurant.description.toLowerCase().includes(lowerQuery);
                expect(nameContains || descContains).toBe(false);
              }
            }
          }
        )
      );
    });
  });

  describe('Result is always a subset of the input', () => {
    it('should never return more restaurants than the input set', () => {
      fc.assert(
        fc.property(
          restaurantTextSearchArrayArb,
          searchQueryArb,
          (restaurants, query) => {
            const result = filterByTextSearch(restaurants, query);
            expect(result.length).toBeLessThanOrEqual(restaurants.length);
          }
        )
      );
    });
  });

  describe('Query shorter than 2 characters returns empty result', () => {
    it('should return no restaurants when query has fewer than 2 characters', () => {
      fc.assert(
        fc.property(
          restaurantTextSearchArrayArb,
          fc.string({ minLength: 0, maxLength: 1 }),
          (restaurants, shortQuery) => {
            const result = filterByTextSearch(restaurants, shortQuery);
            expect(result.length).toBe(0);
          }
        )
      );
    });
  });

  describe('Search is case-insensitive', () => {
    it('should return the same results regardless of query case', () => {
      fc.assert(
        fc.property(
          restaurantTextSearchArrayArb,
          searchQueryArb,
          (restaurants, query) => {
            const resultLower = filterByTextSearch(restaurants, query.toLowerCase());
            const resultUpper = filterByTextSearch(restaurants, query.toUpperCase());

            // Both should return the same set of restaurant IDs
            const idsLower = new Set(resultLower.map((r) => r.id));
            const idsUpper = new Set(resultUpper.map((r) => r.id));
            expect(idsLower).toEqual(idsUpper);
          }
        )
      );
    });
  });
});


// Feature: restaurant-management, Property 11: Combined restaurant filters equal intersection

/**
 * Validates: Requirements 5.6
 *
 * Property 11: Combined restaurant filters equal intersection
 * For any set of restaurants and any combination of active filters, the result
 * of applying all filters simultaneously SHALL be a subset of the result of
 * applying each individual filter alone.
 */

// --- Types for Property 11 ---

interface RestaurantFull {
  id: string;
  name: string;
  description: string | null;
  price_level: PriceLevel | null;
  cuisine_types: CuisineType[];
  lunch_hours: LunchHours | null;
}

interface CombinedFilters {
  priceLevels: PriceLevel[] | null; // null means filter not active
  cuisineTypes: CuisineType[] | null; // null means filter not active
  searchQuery: string | null; // null means filter not active
}

// --- Individual filter functions for Property 11 ---

/**
 * Filters restaurants by price level (OR logic).
 * Returns restaurants whose price_level is in the selected subset.
 */
function filterFullByPriceLevel(
  restaurants: RestaurantFull[],
  selectedLevels: PriceLevel[]
): RestaurantFull[] {
  return restaurants.filter(
    (r) => r.price_level !== null && selectedLevels.includes(r.price_level)
  );
}

/**
 * Filters restaurants by cuisine type (OR logic).
 * Returns restaurants with at least one matching cuisine type.
 */
function filterFullByCuisineType(
  restaurants: RestaurantFull[],
  selectedCuisines: CuisineType[]
): RestaurantFull[] {
  return restaurants.filter(
    (r) =>
      r.cuisine_types.length > 0 &&
      r.cuisine_types.some((ct) => selectedCuisines.includes(ct))
  );
}

/**
 * Filters restaurants by text search (case-insensitive partial match).
 * Query must be at least 2 characters.
 */
function filterFullByTextSearch(
  restaurants: RestaurantFull[],
  query: string
): RestaurantFull[] {
  if (query.length < 2) return [...restaurants];
  const lowerQuery = query.toLowerCase();
  return restaurants.filter(
    (r) =>
      r.name.toLowerCase().includes(lowerQuery) ||
      (r.description !== null && r.description.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Applies all active filters simultaneously (AND logic).
 * A filter is active only if its value is non-null.
 */
function filterCombined(
  restaurants: RestaurantFull[],
  filters: CombinedFilters
): RestaurantFull[] {
  return restaurants.filter((r) => {
    // Price level filter
    if (filters.priceLevels !== null) {
      if (r.price_level === null || !filters.priceLevels.includes(r.price_level)) {
        return false;
      }
    }

    // Cuisine type filter
    if (filters.cuisineTypes !== null) {
      if (
        r.cuisine_types.length === 0 ||
        !r.cuisine_types.some((ct) => filters.cuisineTypes!.includes(ct))
      ) {
        return false;
      }
    }

    // Text search filter
    if (filters.searchQuery !== null && filters.searchQuery.length >= 2) {
      const lowerQuery = filters.searchQuery.toLowerCase();
      const nameMatch = r.name.toLowerCase().includes(lowerQuery);
      const descMatch =
        r.description !== null && r.description.toLowerCase().includes(lowerQuery);
      if (!nameMatch && !descMatch) {
        return false;
      }
    }

    return true;
  });
}

// --- Generators for Property 11 ---

/** Arbitrary restaurant with all relevant fields */
const restaurantFullArb: fc.Arbitrary<RestaurantFull> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 2, maxLength: 100 }).filter((s) => s.trim().length >= 2),
  description: fc.oneof(
    fc.constant(null),
    fc.string({ minLength: 0, maxLength: 200 })
  ),
  price_level: fc.oneof(
    fc.constant<PriceLevel>('budżetowa'),
    fc.constant<PriceLevel>('średnia'),
    fc.constant<PriceLevel>('premium'),
    fc.constant(null)
  ) as fc.Arbitrary<PriceLevel | null>,
  cuisine_types: fc.subarray(allCuisineTypes, { minLength: 0, maxLength: 4 }),
  lunch_hours: fc.oneof(lunchHoursArb, fc.constant(null)),
});

/** Arbitrary array of full restaurants (1 to 30 items) */
const restaurantFullArrayArb = fc.array(restaurantFullArb, {
  minLength: 1,
  maxLength: 30,
});

/** Arbitrary combined filters — at least one filter must be active */
const combinedFiltersArb: fc.Arbitrary<CombinedFilters> = fc
  .record({
    priceLevels: fc.oneof(
      fc.constant(null),
      fc.subarray(allPriceLevels, { minLength: 1, maxLength: 3 })
    ) as fc.Arbitrary<PriceLevel[] | null>,
    cuisineTypes: fc.oneof(
      fc.constant(null),
      fc.subarray(allCuisineTypes, { minLength: 1, maxLength: 8 })
    ) as fc.Arbitrary<CuisineType[] | null>,
    searchQuery: fc.oneof(
      fc.constant(null),
      fc.string({ minLength: 2, maxLength: 30 }).filter((s) => s.trim().length >= 2)
    ),
  })
  .filter(
    (f) => f.priceLevels !== null || f.cuisineTypes !== null || f.searchQuery !== null
  );

describe('Property 11: Combined restaurant filters equal intersection', () => {
  describe('Combined result is a subset of each individual filter result', () => {
    it('every restaurant in the combined result must also appear in each individual filter result', () => {
      fc.assert(
        fc.property(
          restaurantFullArrayArb,
          combinedFiltersArb,
          (restaurants, filters) => {
            const combinedResult = filterCombined(restaurants, filters);
            const combinedIds = new Set(combinedResult.map((r) => r.id));

            // Apply each individual filter and collect their result IDs
            const individualResults: Set<string>[] = [];

            if (filters.priceLevels !== null) {
              const priceLevelResult = filterFullByPriceLevel(restaurants, filters.priceLevels);
              individualResults.push(new Set(priceLevelResult.map((r) => r.id)));
            }

            if (filters.cuisineTypes !== null) {
              const cuisineResult = filterFullByCuisineType(restaurants, filters.cuisineTypes);
              individualResults.push(new Set(cuisineResult.map((r) => r.id)));
            }

            if (filters.searchQuery !== null && filters.searchQuery.length >= 2) {
              const textResult = filterFullByTextSearch(restaurants, filters.searchQuery);
              individualResults.push(new Set(textResult.map((r) => r.id)));
            }

            // Verify: every restaurant in the combined result appears in ALL individual results
            for (const id of combinedIds) {
              for (const individualSet of individualResults) {
                expect(individualSet.has(id)).toBe(true);
              }
            }
          }
        )
      );
    });
  });

  describe('Combined result equals the intersection of individual filter results', () => {
    it('a restaurant in all individual results must also be in the combined result', () => {
      fc.assert(
        fc.property(
          restaurantFullArrayArb,
          combinedFiltersArb,
          (restaurants, filters) => {
            const combinedResult = filterCombined(restaurants, filters);
            const combinedIds = new Set(combinedResult.map((r) => r.id));

            // Apply each individual filter
            const individualResults: Set<string>[] = [];

            if (filters.priceLevels !== null) {
              const priceLevelResult = filterFullByPriceLevel(restaurants, filters.priceLevels);
              individualResults.push(new Set(priceLevelResult.map((r) => r.id)));
            }

            if (filters.cuisineTypes !== null) {
              const cuisineResult = filterFullByCuisineType(restaurants, filters.cuisineTypes);
              individualResults.push(new Set(cuisineResult.map((r) => r.id)));
            }

            if (filters.searchQuery !== null && filters.searchQuery.length >= 2) {
              const textResult = filterFullByTextSearch(restaurants, filters.searchQuery);
              individualResults.push(new Set(textResult.map((r) => r.id)));
            }

            // Compute intersection of all individual results
            if (individualResults.length > 0) {
              const intersection = restaurants
                .map((r) => r.id)
                .filter((id) => individualResults.every((set) => set.has(id)));

              // Every ID in the intersection must be in the combined result
              for (const id of intersection) {
                expect(combinedIds.has(id)).toBe(true);
              }
            }
          }
        )
      );
    });
  });

  describe('Combined result is a subset of the input', () => {
    it('should never return more restaurants than the input set', () => {
      fc.assert(
        fc.property(
          restaurantFullArrayArb,
          combinedFiltersArb,
          (restaurants, filters) => {
            const combinedResult = filterCombined(restaurants, filters);
            expect(combinedResult.length).toBeLessThanOrEqual(restaurants.length);
          }
        )
      );
    });
  });
});
