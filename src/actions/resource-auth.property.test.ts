// Feature: user-authentication, Property 5: Server Actions reject unauthenticated mutation calls

import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

vi.mock('@/lib/auth', () => ({
  getUser: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/services/geocoding', () => ({
  geocodeAddress: vi.fn(),
}));

vi.mock('@/services/offers', () => ({
  listOffers: vi.fn(),
  getOffer: vi.fn(),
  getOffersByRestaurant: vi.fn(),
  createOffer: vi.fn(),
  updateOffer: vi.fn(),
  deleteOffer: vi.fn(),
}));

import { getUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  createRestaurant,
  deleteRestaurant,
  updateRestaurant,
} from '@/actions/restaurants';
import {
  createOfferAction,
  createOffersBatchAction,
  deleteOfferAction,
  updateOfferAction,
} from '@/actions/offers';
import {
  createOffer,
  deleteOffer,
  updateOffer,
} from '@/services/offers';

const mockedGetUser = vi.mocked(getUser);
const mockedCreateClient = vi.mocked(createClient);
const mockedCreateOffer = vi.mocked(createOffer);
const mockedUpdateOffer = vi.mocked(updateOffer);
const mockedDeleteOffer = vi.mocked(deleteOffer);

const unauthorizedResult = { success: false, error: 'Brak autoryzacji' };

/**
 * Validates: Requirements 4.5
 *
 * Property 5: Server Actions reject unauthenticated mutation calls.
 * Every resource mutation must reject a Guest before it can reach a database
 * client or an offer-service write operation.
 */
describe('Property 5: Server Actions reject unauthenticated mutation calls', () => {
  it('rejects every restaurant and offer mutation without executing a database write', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (resourceId) => {
        vi.clearAllMocks();
        mockedGetUser.mockResolvedValue(null);

        const results = await Promise.all([
          createRestaurant({ name: 'Test Restaurant', address: 'Test Street 1' }),
          updateRestaurant(resourceId, { name: 'Updated Restaurant' }),
          deleteRestaurant(resourceId),
          createOfferAction({}),
          createOffersBatchAction([{}]),
          updateOfferAction(resourceId, {}),
          deleteOfferAction(resourceId),
        ]);

        for (const result of results) {
          expect(result).toEqual(unauthorizedResult);
        }

        expect(mockedGetUser).toHaveBeenCalledTimes(7);
        expect(mockedCreateClient).not.toHaveBeenCalled();
        expect(mockedCreateOffer).not.toHaveBeenCalled();
        expect(mockedUpdateOffer).not.toHaveBeenCalled();
        expect(mockedDeleteOffer).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });
});
