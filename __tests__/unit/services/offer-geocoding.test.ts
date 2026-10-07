/**
 * Regression tests for #17 -- offer geocoding happens on the server, before
 * the INSERT.
 *
 * Before this, geocoding ran in the client after `createOfferAction` had
 * already written the row, and the coordinates were used only for a
 * `console.warn`. `get_offers_within_radius` filters
 * `WHERE restaurant_location IS NOT NULL`, so every AI-added offer -- which is
 * nearly all of them -- was permanently invisible to distance filtering and
 * sorting, making Requirements 1.1 and 6.5 unreachable for the main flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/services/geocoding', () => ({ geocodeAddress: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { geocodeAddress } from '@/services/geocoding';
import { createOffer } from '@/services/offers';

const mockedCreateClient = vi.mocked(createClient);
const mockedGeocode = vi.mocked(geocodeAddress);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const WARSAW = { latitude: 52.2297, longitude: 21.0122 };

let insertedRow: Record<string, unknown> | undefined;

/** Captures the row handed to insert() and returns a chainable stub. */
function stubClient(opts: { restaurantLocation?: string | null } = {}) {
  insertedRow = undefined;

  const from = vi.fn((table: string) => {
    if (table === 'restaurants') {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.single = async () => ({
        data: { location: opts.restaurantLocation, name: 'Bar Mleko', address: 'Testowa 1' },
        error: null,
      });
      return chain;
    }

    const chain: Record<string, unknown> = {};
    chain.insert = (row: Record<string, unknown>) => {
      insertedRow = row;
      return chain;
    };
    chain.select = () => chain;
    chain.single = async () => ({
      data: {
        ...insertedRow,
        id: 'offer-1',
        currency: 'PLN',
        user_id: USER_ID,
        session_token: null,
        created_at: '',
        updated_at: '',
      },
      error: null,
    });
    return chain;
  });

  mockedCreateClient.mockResolvedValue({ from } as never);
}

function offerInput(overrides: Record<string, unknown> = {}) {
  return {
    dishName: 'Kotlet schabowy',
    price: 24.9,
    restaurantName: 'Bar Mleko',
    availableDate: new Date().toISOString().slice(0, 10),
    sourceType: 'photo' as const,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  stubClient();
  mockedGeocode.mockResolvedValue(WARSAW);
});

describe('#17: an AI-added offer gets coordinates', () => {
  it('geocodes the address and stores the result on the inserted row', async () => {
    // The exact shape of the AI flow: an address, no restaurantId.
    const result = await createOffer(
      offerInput({ restaurantAddress: 'Marszałkowska 10, Warszawa' }),
      USER_ID,
    );

    expect(result.success).toBe(true);
    expect(mockedGeocode).toHaveBeenCalledWith('Marszałkowska 10, Warszawa');
    expect(insertedRow?.restaurant_location).toBe('POINT(21.0122 52.2297)');
  });

  it('geocodes before the INSERT, not after it', async () => {
    const order: string[] = [];
    mockedGeocode.mockImplementation(async () => {
      order.push('geocode');
      return WARSAW;
    });
    stubClient();
    mockedCreateClient.mockImplementation(async () => {
      const from = vi.fn(() => {
        const chain: Record<string, unknown> = {};
        chain.insert = () => {
          order.push('insert');
          return chain;
        };
        chain.select = () => chain;
        chain.single = async () => ({ data: { ...insertedRow, id: 'o' }, error: null });
        return chain;
      });
      return { from } as never;
    });

    await createOffer(offerInput({ restaurantAddress: 'Kraków' }), USER_ID);

    expect(order).toEqual(['geocode', 'insert']);
  });

  it('does not geocode without an address', async () => {
    await createOffer(offerInput({}), USER_ID);

    expect(mockedGeocode).not.toHaveBeenCalled();
    expect(insertedRow?.restaurant_location).toBeUndefined();
  });

  it('does not geocode when the linked restaurant already has a location', async () => {
    stubClient({ restaurantLocation: 'POINT(21.0122 52.2297)' });

    const result = await createOffer(
      offerInput({ restaurantId: RESTAURANT_ID, restaurantAddress: 'Testowa 1' }),
      USER_ID,
    );

    expect(result.success).toBe(true);
    expect(mockedGeocode).not.toHaveBeenCalled();
    expect(insertedRow?.restaurant_location).toBe('POINT(21.0122 52.2297)');
  });

  it('geocodes when the linked restaurant has no location', async () => {
    stubClient({ restaurantLocation: null });

    await createOffer(
      offerInput({ restaurantId: RESTAURANT_ID, restaurantAddress: 'Testowa 1' }),
      USER_ID,
    );

    expect(mockedGeocode).toHaveBeenCalledWith('Testowa 1');
    expect(insertedRow?.restaurant_location).toBe('POINT(21.0122 52.2297)');
  });
});

describe('#17: Requirement 6.5, a geocoding failure still saves the offer', () => {
  it('inserts without coordinates when geocoding returns null', async () => {
    mockedGeocode.mockResolvedValue(null);

    const result = await createOffer(
      offerInput({ restaurantAddress: 'Nieistniejące Miejsce XYZ' }),
      USER_ID,
    );

    expect(result.success).toBe(true);
    expect(insertedRow).toBeDefined();
    expect(insertedRow?.restaurant_location).toBeUndefined();
  });

  it('inserts without coordinates when geocoding throws', async () => {
    mockedGeocode.mockRejectedValue(new Error('Nominatim unreachable'));

    const result = await createOffer(
      offerInput({ restaurantAddress: 'Cokolwiek' }),
      USER_ID,
    );

    expect(result.success).toBe(true);
    expect(insertedRow).toBeDefined();
    expect(insertedRow?.restaurant_location).toBeUndefined();
  });
});

describe('#17: the client cannot write coordinates', () => {
  it('ignores a restaurantLocation supplied by the caller', async () => {
    // restaurantLocation is not in createOfferSchema, so Zod strips it. The
    // only writer is the server.
    const result = await createOffer(
      offerInput({
        restaurantAddress: 'Marszałkowska 10',
        restaurantLocation: { latitude: 0, longitude: 0 },
      }),
      USER_ID,
    );

    expect(result.success).toBe(true);
    expect(insertedRow?.restaurant_location).toBe('POINT(21.0122 52.2297)');
  });
});
