/**
 * Req 8.3 (#70): when an offer is linked to a restaurant, the snapshot comes
 * from the restaurant entity, not from the client payload.
 *
 * The add flow binds every offer to a restaurant before the form opens, so the
 * client always sends the entity's values — but "always" is a UI property, and
 * UI properties do not guard data. The server enforces it: with `restaurantId`
 * set, the row's `restaurant_name`/`restaurant_address` are read from the
 * entity, and the geocode fallback runs on the entity's address. A stray or
 * stale client value can then neither rename the restaurant on the offer nor
 * point the offer at a place the entity does not know.
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
let geocodeCalls: string[] = [];

interface RestaurantRow {
  location?: string | null;
  name?: string | null;
  address?: string | null;
}

/** Captures the row handed to insert() and every geocode call. */
function stubClient(opts: { restaurant?: RestaurantRow | null } = {}) {
  insertedRow = undefined;
  geocodeCalls = [];

  const from = vi.fn((table: string) => {
    if (table === 'restaurants') {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.single = async () => ({
        data: opts.restaurant === undefined ? null : opts.restaurant,
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
    restaurantName: 'Nazwa z klienta',
    availableDate: new Date().toISOString().slice(0, 10),
    sourceType: 'photo' as const,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  stubClient({ restaurant: null });
  mockedGeocode.mockImplementation(async (address: string) => {
    geocodeCalls.push(address);
    return WARSAW;
  });
});

describe('a linked offer snapshots the restaurant entity, not the client values', () => {
  it('overrides name and address from the entity, even when the client sent different ones', async () => {
    stubClient({
      restaurant: {
        location: 'POINT(21.0122 52.2297)',
        name: 'Bar Mleko',
        address: 'Marszałkowska 10, Warszawa',
      },
    });

    await createOffer(
      offerInput({
        restaurantId: RESTAURANT_ID,
        restaurantName: 'Nazwa z klienta',
        restaurantAddress: 'Stary adres z klienta',
      }),
      USER_ID
    );

    expect(insertedRow?.restaurant_name).toBe('Bar Mleko');
    expect(insertedRow?.restaurant_address).toBe('Marszałkowska 10, Warszawa');
    expect(insertedRow?.restaurant_id).toBe(RESTAURANT_ID);
    // The entity has coordinates, so nothing is geocoded.
    expect(geocodeCalls).toEqual([]);
  });

  it('geocodes the entity address when the entity has one but no coordinates', async () => {
    stubClient({
      restaurant: { name: 'Bar Mleko', address: 'Marszałkowska 10, Warszawa' },
    });

    const result = await createOffer(
      offerInput({
        restaurantId: RESTAURANT_ID,
        restaurantName: 'Nazwa z klienta',
        restaurantAddress: 'Inny adres z klienta',
      }),
      USER_ID
    );

    expect(geocodeCalls).toEqual(['Marszałkowska 10, Warszawa']);
    expect(insertedRow?.restaurant_address).toBe('Marszałkowska 10, Warszawa');
    expect(result.success).toBe(true);
    if (result.success) expect(result.locationWarning).toBeUndefined();
  });

  it('keeps a null entity address instead of using the client address', async () => {
    stubClient({ restaurant: { name: 'Bar Mleko', address: null } });

    await createOffer(
      offerInput({
        restaurantId: RESTAURANT_ID,
        restaurantAddress: 'Adres od użytkownika',
      }),
      USER_ID
    );

    expect(geocodeCalls).toEqual([]);
    expect(insertedRow?.restaurant_address).toBeNull();
  });

  it('refuses creation when the linked restaurant cannot be found', async () => {
    stubClient({ restaurant: null });

    const result = await createOffer(
      offerInput({
        restaurantId: RESTAURANT_ID,
        restaurantName: 'Bar Mleko',
        restaurantAddress: 'Adres od użytkownika',
      }),
      USER_ID
    );

    expect(result.success).toBe(false);
    expect(insertedRow).toBeUndefined();
    expect(geocodeCalls).toEqual([]);
  });
});

describe('an unlinked offer behaves as before', () => {
  it('uses the client name and address and geocodes the address', async () => {
    stubClient({ restaurant: null });

    await createOffer(
      offerInput({ restaurantName: 'Bar Mleko', restaurantAddress: 'Marszałkowska 10' }),
      USER_ID
    );

    expect(insertedRow?.restaurant_name).toBe('Bar Mleko');
    expect(insertedRow?.restaurant_address).toBe('Marszałkowska 10');
    expect(insertedRow?.restaurant_id).toBeUndefined();
    expect(geocodeCalls).toEqual(['Marszałkowska 10']);
  });
});
