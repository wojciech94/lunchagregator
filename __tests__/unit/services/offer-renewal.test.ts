/**
 * Tests for `renewRestaurantMenu` (Req 8.5–8.6, #71) -- the service behind
 * the "wznów" button.
 *
 * The contract under test:
 * - the place comes from the restaurant's current row and is passed to
 *   `createOffer` as a preset, so **geocoding is never called** (Req 8.5);
 * - targets are `source + 7` and carry the restaurant entity's snapshot;
 * - a slot the User already scheduled is skipped and reported;
 * - a restaurant without coordinates yields offers without them, counted;
 * - an archive (anchor older than a week) is refused with a message.
 *
 * The clock is faked for `Date` only, so `getTodayDate()` -- and with it the
 * anchor and the window -- is frozen to a Monday noon.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/services/geocoding', () => ({ geocodeAddress: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { geocodeAddress } from '@/services/geocoding';
import { renewRestaurantMenu } from '@/services/offers';

const mockedCreateClient = vi.mocked(createClient);
const mockedGeocode = vi.mocked(geocodeAddress);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const RESTAURANT_LOCATION = 'POINT(21.0122 52.2297)';

// Today is Monday 2026-10-05; the menu week is Mon 05 – Fri 09.
const TODAY = new Date(2026, 9, 5, 12, 0, 0);

interface FixtureOffer {
  id: string;
  dish_name: string;
  available_date: string;
  price?: number;
  source_type?: string;
}

interface FixtureOptions {
  restaurant?: {
    name?: string;
    address?: string | null;
    location?: string | null;
  } | null;
  offers?: FixtureOffer[];
}

function stubClient(opts: FixtureOptions = {}) {
  const insertedRows: Record<string, unknown>[] = [];
  const geocodeCalls: string[] = [];

  mockedGeocode.mockImplementation(async (address: string) => {
    geocodeCalls.push(address);
    return { latitude: 52.2297, longitude: 21.0122 };
  });

  let insertIndex = 0;

  const from = vi.fn((table: string) => {
    if (table === 'restaurants') {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.single = async () => ({
        data:
          opts.restaurant === undefined
            ? null
            : {
                id: RESTAURANT_ID,
                name: opts.restaurant?.name ?? 'Bar Mleko',
                address:
                  opts.restaurant?.address === undefined
                    ? 'Marszałkowska 10, Warszawa'
                    : opts.restaurant.address,
                location:
                  opts.restaurant?.location === undefined
                    ? RESTAURANT_LOCATION
                    : opts.restaurant.location,
              },
        error: null,
      });
      return chain;
    }

    // lunch_offers: the first call is the renewal fetch; every later call is
    // one offer's INSERT.
    const chain: Record<string, unknown> = {};
    chain.insert = (row: Record<string, unknown>) => {
      insertedRows.push(row);
      return chain;
    };
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.gte = () => chain;
    chain.order = () => chain;
    chain.limit = () =>
      Promise.resolve({ data: opts.offers ?? [], error: null });
    chain.single = async () => {
      const row = insertedRows[insertIndex] ?? {};
      insertIndex += 1;
      return {
        data: {
          ...row,
          currency: 'PLN',
          user_id: USER_ID,
          session_token: null,
          created_at: '',
          updated_at: '',
        },
        error: null,
      };
    };
    return chain;
  });

  mockedCreateClient.mockResolvedValue({ from } as never);
  return { insertedRows, geocodeCalls };
}

function menuWeek(): FixtureOffer[] {
  return ['Zestaw', 'Pierogi', 'Żurek', 'Kotlet', 'Ryba'].map((dish_name, index) => ({
    id: `offer-${index}`,
    dish_name,
    available_date: `2026-10-0${5 + index}`,
    price: 24.9,
    source_type: 'photo',
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: TODAY, toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('renewRestaurantMenu: the happy path', () => {
  it('creates next week from the current one, from the restaurant entity, without geocoding', async () => {
    const { insertedRows, geocodeCalls } = stubClient({
      restaurant: { name: 'Bar Mleko', address: 'Marszałkowska 10, Warszawa', location: RESTAURANT_LOCATION },
      offers: menuWeek(),
    });

    const result = await renewRestaurantMenu(RESTAURANT_ID, USER_ID);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      created: 5,
      skipped: 0,
      failed: 0,
      missingCoordinates: 0,
    });

    // Targets are source + 7: next week's Monday through Friday.
    expect(insertedRows.map((row) => row.available_date)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
    ]);
    // The snapshot comes from the restaurant entity, and every row is linked.
    for (const row of insertedRows) {
      expect(row.restaurant_name).toBe('Bar Mleko');
      expect(row.restaurant_address).toBe('Marszałkowska 10, Warszawa');
      expect(row.restaurant_id).toBe(RESTAURANT_ID);
      expect(row.restaurant_location).toBe(RESTAURANT_LOCATION);
    }
    // Req 8.5: renewal never geocodes.
    expect(geocodeCalls).toEqual([]);
  });

  it('a slot the User already scheduled is skipped, not duplicated', async () => {
    const offers = [
      ...menuWeek(),
      // The User already added next Monday's dish by hand.
      { id: 'offer-manual', dish_name: 'Zestaw', available_date: '2026-10-12', price: 24.9, source_type: 'photo' },
    ];
    const { insertedRows } = stubClient({
      restaurant: { location: RESTAURANT_LOCATION },
      offers,
    });

    const result = await renewRestaurantMenu(RESTAURANT_ID, USER_ID);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.created).toBe(4);
    expect(result.data.skipped).toBe(1);
    expect(insertedRows.map((row) => row.available_date)).not.toContain('2026-10-12');
  });

  it('a restaurant without coordinates yields unplaced offers, counted and never geocoded', async () => {
    const { insertedRows, geocodeCalls } = stubClient({
      restaurant: { address: 'Marszałkowska 10, Warszawa', location: null },
      offers: menuWeek(),
    });

    const result = await renewRestaurantMenu(RESTAURANT_ID, USER_ID);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.created).toBe(5);
    expect(result.data.missingCoordinates).toBe(5);
    for (const row of insertedRows) {
      expect(row.restaurant_location).toBeUndefined();
    }
    expect(geocodeCalls).toEqual([]);
  });
});

describe('renewRestaurantMenu: refusals', () => {
  it('refuses an archive: an anchor older than a week is not a menu', async () => {
    const { insertedRows } = stubClient({
      restaurant: { location: RESTAURANT_LOCATION },
      offers: [
        { id: 'offer-old', dish_name: 'Zestaw', available_date: '2026-09-25', price: 24.9, source_type: 'photo' },
      ],
    });

    const result = await renewRestaurantMenu(RESTAURANT_ID, USER_ID);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/starsze niż tydzień/);
    expect(insertedRows).toEqual([]);
  });

  it('refuses when the User has no offers for the restaurant', async () => {
    const { insertedRows } = stubClient({
      restaurant: { location: RESTAURANT_LOCATION },
      offers: [],
    });

    const result = await renewRestaurantMenu(RESTAURANT_ID, USER_ID);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/Brak ofert/);
    expect(insertedRows).toEqual([]);
  });

  it('refuses when there is nothing left to create', async () => {
    // Next week is already fully populated by hand: every target exists.
    const offers = [
      ...menuWeek(),
      ...menuWeek().map((offer, index) => ({
        ...offer,
        id: `offer-next-${index}`,
        available_date: `2026-10-1${2 + index}`,
      })),
    ];
    const { insertedRows } = stubClient({
      restaurant: { location: RESTAURANT_LOCATION },
      offers,
    });

    const result = await renewRestaurantMenu(RESTAURANT_ID, USER_ID);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/Nie ma czego wznowić/);
    expect(insertedRows).toEqual([]);
  });
});
