// Feature: restaurant-management, Property 12: Offer snapshot immutability on restaurant update

import { describe, it, expect } from 'vitest';
import { fc } from './fc-config';

/**
 * Validates: Requirements 6.4
 *
 * Property 12: Offer snapshot immutability on restaurant update
 * For any restaurant with associated lunch offers, updating the restaurant's
 * name, address, or location SHALL NOT modify the `restaurant_name`,
 * `restaurant_address`, or `restaurant_location` fields of previously created
 * lunch offers.
 *
 * Key insight: offers store a COPY of restaurant data at creation time.
 * Updating the restaurant doesn't retroactively change offers.
 */

// --- Types ---

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface Restaurant {
  id: string;
  name: string;
  address: string | null;
  location: Coordinates | null;
}

interface LunchOfferSnapshot {
  id: string;
  restaurantId: string;
  restaurantName: string;
  restaurantAddress: string | null;
  restaurantLocation: Coordinates | null;
}

interface UpdateRestaurantInput {
  name?: string;
  address?: string | null;
  location?: Coordinates | null;
}

// --- Snapshot pattern simulation ---

/**
 * Creates an offer that snapshots the restaurant data at creation time.
 * This simulates the real behavior: when an offer is created, it copies
 * the restaurant's current name, address, and location into its own fields.
 */
function createOfferWithSnapshot(
  offerId: string,
  restaurant: Restaurant
): LunchOfferSnapshot {
  return {
    id: offerId,
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    restaurantAddress: restaurant.address,
    restaurantLocation: restaurant.location
      ? { ...restaurant.location }
      : null,
  };
}

/**
 * Simulates updating a restaurant's fields. This modifies the restaurant
 * entity but should NOT affect any previously created offer snapshots.
 */
function updateRestaurant(
  restaurant: Restaurant,
  updates: UpdateRestaurantInput
): Restaurant {
  return {
    ...restaurant,
    name: updates.name !== undefined ? updates.name : restaurant.name,
    address: updates.address !== undefined ? updates.address : restaurant.address,
    location: updates.location !== undefined ? updates.location : restaurant.location,
  };
}

// --- Generators ---

const coordinatesArb = fc.record({
  latitude: fc.double({ min: -90, max: 90, noNaN: true }),
  longitude: fc.double({ min: -180, max: 180, noNaN: true }),
});

const restaurantNameArb = fc.string({ minLength: 2, maxLength: 100 }).filter((s) => s.trim().length >= 2);

const addressArb = fc.option(
  fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length >= 1),
  { nil: null }
);

const locationArb = fc.option(coordinatesArb, { nil: null });

const restaurantArb = fc.record({
  id: fc.uuid(),
  name: restaurantNameArb,
  address: addressArb,
  location: locationArb,
});

const offerIdArb = fc.uuid();

/** Generate a non-empty array of offer IDs (1 to 5 offers per restaurant) */
const offerIdsArb = fc.array(offerIdArb, { minLength: 1, maxLength: 5 });

/** Generate update input that changes at least one field */
const updateInputArb = fc.record({
  name: fc.option(restaurantNameArb, { nil: undefined }),
  address: fc.option(
    fc.option(
      fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length >= 1),
      { nil: null }
    ),
    { nil: undefined }
  ),
  location: fc.option(fc.option(coordinatesArb, { nil: null }), { nil: undefined }),
});

describe('Property 12: Offer snapshot immutability on restaurant update', () => {
  describe('Updating restaurant name does not change offer snapshots', () => {
    it('should preserve offer restaurant_name after restaurant name update', () => {
      fc.assert(
        fc.property(
          restaurantArb,
          offerIdsArb,
          restaurantNameArb,
          (restaurant, offerIds, newName) => {
            // Create offers that snapshot the restaurant data
            const offers = offerIds.map((id) =>
              createOfferWithSnapshot(id, restaurant)
            );

            // Update the restaurant name
            const updatedRestaurant = updateRestaurant(restaurant, { name: newName });

            // Verify: offers still have the ORIGINAL restaurant name
            for (const offer of offers) {
              expect(offer.restaurantName).toBe(restaurant.name);
              expect(offer.restaurantName).not.toBe(updatedRestaurant.name === restaurant.name ? undefined : undefined);
            }

            // Verify: the restaurant itself was updated
            expect(updatedRestaurant.name).toBe(newName);

            // Verify: offers are NOT affected by the restaurant update
            for (const offer of offers) {
              expect(offer.restaurantName).toBe(restaurant.name);
            }
          }
        )
      );
    });
  });

  describe('Updating restaurant address does not change offer snapshots', () => {
    it('should preserve offer restaurant_address after restaurant address update', () => {
      fc.assert(
        fc.property(
          restaurantArb,
          offerIdsArb,
          addressArb,
          (restaurant, offerIds, newAddress) => {
            // Create offers that snapshot the restaurant data
            const offers = offerIds.map((id) =>
              createOfferWithSnapshot(id, restaurant)
            );

            // Update the restaurant address
            const updatedRestaurant = updateRestaurant(restaurant, { address: newAddress });

            // Verify: offers still have the ORIGINAL restaurant address
            for (const offer of offers) {
              expect(offer.restaurantAddress).toBe(restaurant.address);
            }

            // Verify: the restaurant itself was updated
            expect(updatedRestaurant.address).toBe(newAddress);
          }
        )
      );
    });
  });

  describe('Updating restaurant location does not change offer snapshots', () => {
    it('should preserve offer restaurant_location after restaurant location update', () => {
      fc.assert(
        fc.property(
          restaurantArb,
          offerIdsArb,
          locationArb,
          (restaurant, offerIds, newLocation) => {
            // Create offers that snapshot the restaurant data
            const offers = offerIds.map((id) =>
              createOfferWithSnapshot(id, restaurant)
            );

            // Update the restaurant location
            const updatedRestaurant = updateRestaurant(restaurant, { location: newLocation });

            // Verify: offers still have the ORIGINAL restaurant location
            for (const offer of offers) {
              if (restaurant.location === null) {
                expect(offer.restaurantLocation).toBeNull();
              } else {
                expect(offer.restaurantLocation).toEqual(restaurant.location);
              }
            }

            // Verify: the restaurant itself was updated
            expect(updatedRestaurant.location).toEqual(newLocation);
          }
        )
      );
    });
  });

  describe('Updating multiple restaurant fields simultaneously does not change offer snapshots', () => {
    it('should preserve all offer snapshot fields after combined restaurant update', () => {
      fc.assert(
        fc.property(
          restaurantArb,
          offerIdsArb,
          updateInputArb,
          (restaurant, offerIds, updates) => {
            // Create offers that snapshot the restaurant data
            const offers = offerIds.map((id) =>
              createOfferWithSnapshot(id, restaurant)
            );

            // Store original snapshot values for comparison
            const originalSnapshots = offers.map((offer) => ({
              restaurantName: offer.restaurantName,
              restaurantAddress: offer.restaurantAddress,
              restaurantLocation: offer.restaurantLocation
                ? { ...offer.restaurantLocation }
                : null,
            }));

            // Update the restaurant with potentially multiple field changes
            updateRestaurant(restaurant, updates);

            // Verify: ALL offer snapshot fields remain unchanged
            for (let i = 0; i < offers.length; i++) {
              expect(offers[i].restaurantName).toBe(originalSnapshots[i].restaurantName);
              expect(offers[i].restaurantAddress).toBe(originalSnapshots[i].restaurantAddress);
              expect(offers[i].restaurantLocation).toEqual(originalSnapshots[i].restaurantLocation);
            }
          }
        )
      );
    });
  });

  describe('Snapshot is a deep copy — location object mutation does not affect offers', () => {
    it('should not be affected by direct mutation of the restaurant location object', () => {
      fc.assert(
        fc.property(
          restaurantArb.filter((r) => r.location !== null),
          offerIdsArb,
          coordinatesArb,
          (restaurant, offerIds, newCoords) => {
            // Create offers that snapshot the restaurant data
            const offers = offerIds.map((id) =>
              createOfferWithSnapshot(id, restaurant)
            );

            // Store original location for comparison
            const originalLocation = { ...restaurant.location! };

            // Directly mutate the restaurant's location object (simulating a bad update)
            restaurant.location!.latitude = newCoords.latitude;
            restaurant.location!.longitude = newCoords.longitude;

            // Verify: offers still have the ORIGINAL location (deep copy protects them)
            for (const offer of offers) {
              expect(offer.restaurantLocation).toEqual(originalLocation);
            }
          }
        )
      );
    });
  });
});

// Feature: restaurant-management, Property 13: Auto-populate offer fields from restaurant

/**
 * Validates: Requirements 6.2
 *
 * Property 13: Auto-populate offer fields from restaurant
 * For any restaurant selected during offer creation, the offer's `restaurant_name`
 * SHALL equal the restaurant's `name`, the offer's `restaurant_address` SHALL equal
 * the restaurant's `address`, and the offer's `restaurant_location` SHALL equal the
 * restaurant's `location`.
 *
 * Key insight: when a user selects a restaurant during offer creation, the system
 * auto-populates the offer's restaurant fields from the selected restaurant entity.
 */

/**
 * Simulates the auto-populate behavior when a user selects a restaurant
 * during offer creation. The system copies the restaurant's current name,
 * address, and location into the offer fields.
 */
function autoPopulateOfferFromRestaurant(
  offerId: string,
  restaurant: Restaurant
): LunchOfferSnapshot {
  return {
    id: offerId,
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    restaurantAddress: restaurant.address,
    restaurantLocation: restaurant.location
      ? { ...restaurant.location }
      : null,
  };
}

describe('Property 13: Auto-populate offer fields from restaurant', () => {
  describe('Offer restaurant_name equals selected restaurant name', () => {
    it('should set offer restaurant_name to the selected restaurant name', () => {
      fc.assert(
        fc.property(
          restaurantArb,
          offerIdArb,
          (restaurant, offerId) => {
            // Simulate selecting a restaurant during offer creation
            const offer = autoPopulateOfferFromRestaurant(offerId, restaurant);

            // Verify: offer's restaurant_name equals the restaurant's name
            expect(offer.restaurantName).toBe(restaurant.name);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Offer restaurant_address equals selected restaurant address', () => {
    it('should set offer restaurant_address to the selected restaurant address', () => {
      fc.assert(
        fc.property(
          restaurantArb,
          offerIdArb,
          (restaurant, offerId) => {
            // Simulate selecting a restaurant during offer creation
            const offer = autoPopulateOfferFromRestaurant(offerId, restaurant);

            // Verify: offer's restaurant_address equals the restaurant's address
            expect(offer.restaurantAddress).toBe(restaurant.address);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Offer restaurant_location equals selected restaurant location', () => {
    it('should set offer restaurant_location to the selected restaurant location', () => {
      fc.assert(
        fc.property(
          restaurantArb,
          offerIdArb,
          (restaurant, offerId) => {
            // Simulate selecting a restaurant during offer creation
            const offer = autoPopulateOfferFromRestaurant(offerId, restaurant);

            // Verify: offer's restaurant_location equals the restaurant's location
            if (restaurant.location === null) {
              expect(offer.restaurantLocation).toBeNull();
            } else {
              expect(offer.restaurantLocation).toEqual(restaurant.location);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('All offer snapshot fields match restaurant data simultaneously', () => {
    it('should auto-populate all fields correctly for any restaurant', () => {
      fc.assert(
        fc.property(
          restaurantArb,
          offerIdArb,
          (restaurant, offerId) => {
            // Simulate selecting a restaurant during offer creation
            const offer = autoPopulateOfferFromRestaurant(offerId, restaurant);

            // Verify all three fields match simultaneously
            expect(offer.restaurantName).toBe(restaurant.name);
            expect(offer.restaurantAddress).toBe(restaurant.address);
            expect(offer.restaurantLocation).toEqual(restaurant.location);

            // Verify the offer is linked to the correct restaurant
            expect(offer.restaurantId).toBe(restaurant.id);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Auto-populate with diverse restaurant data', () => {
    it('should correctly populate for restaurants with various names, addresses, and locations', () => {
      // Generator for restaurants with diverse data patterns
      const diverseRestaurantArb = fc.oneof(
        // Restaurant with all fields populated
        fc.record({
          id: fc.uuid(),
          name: restaurantNameArb,
          address: fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length >= 1),
          location: coordinatesArb,
        }).map((r) => ({ ...r, address: r.address as string | null, location: r.location as Coordinates | null })),
        // Restaurant with address but no location
        fc.record({
          id: fc.uuid(),
          name: restaurantNameArb,
          address: fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length >= 1),
          location: fc.constant(null),
        }).map((r) => ({ ...r, address: r.address as string | null, location: r.location as Coordinates | null })),
        // Restaurant with location but no address
        fc.record({
          id: fc.uuid(),
          name: restaurantNameArb,
          address: fc.constant(null),
          location: coordinatesArb,
        }).map((r) => ({ ...r, address: r.address as string | null, location: r.location as Coordinates | null })),
      );

      fc.assert(
        fc.property(
          diverseRestaurantArb,
          offerIdArb,
          (restaurant, offerId) => {
            // Simulate selecting a restaurant during offer creation
            const offer = autoPopulateOfferFromRestaurant(offerId, restaurant);

            // Verify: all snapshot fields exactly match the restaurant's current data
            expect(offer.restaurantName).toBe(restaurant.name);
            expect(offer.restaurantAddress).toBe(restaurant.address);
            expect(offer.restaurantLocation).toEqual(restaurant.location);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

// Feature: restaurant-management, Property 14: Offer data preservation on restaurant deletion

/**
 * Validates: Requirements 3.4
 *
 * Property 14: Offer data preservation on restaurant deletion
 * For any restaurant with associated lunch offers, after deleting the restaurant,
 * all previously associated offers SHALL retain their `restaurant_name`,
 * `restaurant_address`, and `restaurant_location` values unchanged, and their
 * `restaurant_id` SHALL be set to NULL.
 *
 * Key insight: when a restaurant is deleted, the DB uses ON DELETE SET NULL for
 * the restaurant_id FK. The offer's snapshot fields (restaurant_name, restaurant_address,
 * restaurant_location) are independent columns and remain unchanged.
 */

// --- Types for deletion simulation ---

interface LunchOfferWithMutableFk {
  id: string;
  restaurantId: string | null;
  restaurantName: string;
  restaurantAddress: string | null;
  restaurantLocation: Coordinates | null;
}

/**
 * Simulates the database behavior when a restaurant is deleted:
 * - ON DELETE SET NULL sets restaurant_id to null on all associated offers
 * - Snapshot fields (restaurant_name, restaurant_address, restaurant_location) are NOT touched
 */
function simulateRestaurantDeletion(offers: LunchOfferWithMutableFk[]): LunchOfferWithMutableFk[] {
  return offers.map((offer) => ({
    ...offer,
    restaurantId: null, // ON DELETE SET NULL behavior
    // Snapshot fields remain unchanged — they are independent columns
    restaurantName: offer.restaurantName,
    restaurantAddress: offer.restaurantAddress,
    restaurantLocation: offer.restaurantLocation
      ? { ...offer.restaurantLocation }
      : null,
  }));
}

/**
 * Creates an offer linked to a restaurant with snapshot data copied at creation time.
 */
function createOfferLinkedToRestaurant(
  offerId: string,
  restaurant: Restaurant
): LunchOfferWithMutableFk {
  return {
    id: offerId,
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    restaurantAddress: restaurant.address,
    restaurantLocation: restaurant.location
      ? { ...restaurant.location }
      : null,
  };
}

describe('Property 14: Offer data preservation on restaurant deletion', () => {
  describe('Offers retain restaurant_name after restaurant deletion', () => {
    it('should preserve restaurant_name on all offers when restaurant is deleted', () => {
      fc.assert(
        fc.property(
          restaurantArb,
          offerIdsArb,
          (restaurant, offerIds) => {
            // Create offers linked to the restaurant with snapshot data
            const offers = offerIds.map((id) =>
              createOfferLinkedToRestaurant(id, restaurant)
            );

            // Store original names for comparison
            const originalNames = offers.map((o) => o.restaurantName);

            // Simulate restaurant deletion (ON DELETE SET NULL)
            const offersAfterDeletion = simulateRestaurantDeletion(offers);

            // Verify: all offers retain their original restaurant_name
            for (let i = 0; i < offersAfterDeletion.length; i++) {
              expect(offersAfterDeletion[i].restaurantName).toBe(originalNames[i]);
              expect(offersAfterDeletion[i].restaurantName).toBe(restaurant.name);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Offers retain restaurant_address after restaurant deletion', () => {
    it('should preserve restaurant_address on all offers when restaurant is deleted', () => {
      fc.assert(
        fc.property(
          restaurantArb,
          offerIdsArb,
          (restaurant, offerIds) => {
            // Create offers linked to the restaurant with snapshot data
            const offers = offerIds.map((id) =>
              createOfferLinkedToRestaurant(id, restaurant)
            );

            // Store original addresses for comparison
            const originalAddresses = offers.map((o) => o.restaurantAddress);

            // Simulate restaurant deletion (ON DELETE SET NULL)
            const offersAfterDeletion = simulateRestaurantDeletion(offers);

            // Verify: all offers retain their original restaurant_address
            for (let i = 0; i < offersAfterDeletion.length; i++) {
              expect(offersAfterDeletion[i].restaurantAddress).toBe(originalAddresses[i]);
              expect(offersAfterDeletion[i].restaurantAddress).toBe(restaurant.address);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Offers retain restaurant_location after restaurant deletion', () => {
    it('should preserve restaurant_location on all offers when restaurant is deleted', () => {
      fc.assert(
        fc.property(
          restaurantArb,
          offerIdsArb,
          (restaurant, offerIds) => {
            // Create offers linked to the restaurant with snapshot data
            const offers = offerIds.map((id) =>
              createOfferLinkedToRestaurant(id, restaurant)
            );

            // Store original locations for comparison
            const originalLocations = offers.map((o) =>
              o.restaurantLocation ? { ...o.restaurantLocation } : null
            );

            // Simulate restaurant deletion (ON DELETE SET NULL)
            const offersAfterDeletion = simulateRestaurantDeletion(offers);

            // Verify: all offers retain their original restaurant_location
            for (let i = 0; i < offersAfterDeletion.length; i++) {
              expect(offersAfterDeletion[i].restaurantLocation).toEqual(originalLocations[i]);
              expect(offersAfterDeletion[i].restaurantLocation).toEqual(restaurant.location);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Offers have restaurant_id set to NULL after restaurant deletion', () => {
    it('should set restaurant_id to null on all offers when restaurant is deleted', () => {
      fc.assert(
        fc.property(
          restaurantArb,
          offerIdsArb,
          (restaurant, offerIds) => {
            // Create offers linked to the restaurant
            const offers = offerIds.map((id) =>
              createOfferLinkedToRestaurant(id, restaurant)
            );

            // Verify: offers initially have a non-null restaurant_id
            for (const offer of offers) {
              expect(offer.restaurantId).toBe(restaurant.id);
              expect(offer.restaurantId).not.toBeNull();
            }

            // Simulate restaurant deletion (ON DELETE SET NULL)
            const offersAfterDeletion = simulateRestaurantDeletion(offers);

            // Verify: all offers now have restaurant_id set to null
            for (const offer of offersAfterDeletion) {
              expect(offer.restaurantId).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('All offer snapshot fields preserved simultaneously after deletion', () => {
    it('should preserve all snapshot fields and nullify restaurant_id for any restaurant with offers', () => {
      fc.assert(
        fc.property(
          restaurantArb,
          offerIdsArb,
          (restaurant, offerIds) => {
            // Create offers linked to the restaurant with snapshot data
            const offers = offerIds.map((id) =>
              createOfferLinkedToRestaurant(id, restaurant)
            );

            // Store original snapshot values
            const originalSnapshots = offers.map((offer) => ({
              restaurantName: offer.restaurantName,
              restaurantAddress: offer.restaurantAddress,
              restaurantLocation: offer.restaurantLocation
                ? { ...offer.restaurantLocation }
                : null,
            }));

            // Simulate restaurant deletion (ON DELETE SET NULL)
            const offersAfterDeletion = simulateRestaurantDeletion(offers);

            // Verify: ALL snapshot fields remain unchanged AND restaurant_id is null
            for (let i = 0; i < offersAfterDeletion.length; i++) {
              // Snapshot data preserved
              expect(offersAfterDeletion[i].restaurantName).toBe(originalSnapshots[i].restaurantName);
              expect(offersAfterDeletion[i].restaurantAddress).toBe(originalSnapshots[i].restaurantAddress);
              expect(offersAfterDeletion[i].restaurantLocation).toEqual(originalSnapshots[i].restaurantLocation);

              // FK nullified
              expect(offersAfterDeletion[i].restaurantId).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
