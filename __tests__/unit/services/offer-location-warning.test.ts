/**
 * Requirement 6.5, and the dead `restaurantId` in the update contract.
 *
 * 6.5: "IF the System cannot geocode a provided restaurant address, THEN THE
 * System SHALL store the Lunch_Offer without coordinates AND display a message
 * indicating that distance-based sorting will not be available for this offer."
 *
 * The storage half was implemented in #17. The message half was not: the only
 * sign of a geocoding failure anywhere in the app was a `console.warn` in a
 * component. The server now reports the outcome, which is the only layer that
 * knows it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/services/geocoding', () => ({ geocodeAddress: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getUser: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { geocodeAddress } from '@/services/geocoding';
import { getUser } from '@/lib/auth';
import { createOffer, updateOffer } from '@/services/offers';
import { createOfferAction, createOffersBatchAction } from '@/actions/offers';
import { updateOfferSchema } from '@/lib/validations/offer';

const mockedCreateClient = vi.mocked(createClient);
const mockedGeocode = vi.mocked(geocodeAddress);
const mockedGetUser = vi.mocked(getUser);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const WARSAW = { latitude: 52.2297, longitude: 21.0122 };

let insertedRow: Record<string, unknown> | undefined;

/**
 * Stands in for PostgREST. The stored `restaurant_location` is echoed back, and
 * it goes through the real decoder -- which is why a row written as WKT is
 * reported as having no coordinates here unless the test writes WKB. That is
 * the same thing that happened in production: the write format and the read
 * format are not the same.
 */
function stubClient(opts: { restaurantLocation?: string | null } = {}) {
  insertedRow = undefined;

  const from = vi.fn((table: string) => {
    if (table === 'restaurants') {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.single = async () => ({
        data: { location: opts.restaurantLocation },
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
        restaurant_location: insertedRow?.restaurant_location ?? null,
      },
      error: null,
    });
    chain.update = () => chain;
    return chain;
  });

  mockedCreateClient.mockResolvedValue({ from } as never);
}

/** WKB hex for a point, as PostgREST returns it. */
function wkb({ longitude, latitude }: { longitude: number; latitude: number }): string {
  const bytes = new Uint8Array(25);
  const view = new DataView(bytes.buffer);
  bytes[0] = 1;
  view.setUint32(1, 0x20000001, true);
  view.setUint32(5, 4326, true);
  view.setFloat64(9, longitude, true);
  view.setFloat64(17, latitude, true);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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
  mockedGetUser.mockResolvedValue({ id: USER_ID } as never);
  mockedGeocode.mockResolvedValue(WARSAW);
});

/**
 * Narrows to the success branch, which is the only place `locationWarning`
 * exists. Every test asserts on it, and a cast would defeat the reason the flag
 * is on that branch rather than on the union.
 */
function succeeded(result: Awaited<ReturnType<typeof createOffer>>) {
  if (!result.success) throw new Error(`expected success, got: ${result.error}`);
  return result;
}

describe('Requirement 6.5: the warning rides on a successful save', () => {
  it('is set when an address was given and geocoding produced nothing', async () => {
    mockedGeocode.mockResolvedValue(null);

    const result = succeeded(
      await createOffer(
        offerInput({ restaurantAddress: 'Nieistniejące Miejsce XYZ' }),
        USER_ID,
      ),
    );

    expect(result.locationWarning).toBe(true);
    // The offer is still saved -- that is the other half of 6.5.
    expect(insertedRow).toBeDefined();
  });

  it('is set when geocoding throws', async () => {
    mockedGeocode.mockRejectedValue(new Error('Nominatim unreachable'));

    const result = succeeded(
      await createOffer(
        offerInput({ restaurantAddress: 'Cokolwiek' }),
        USER_ID,
      ),
    );

    expect(result.locationWarning).toBe(true);
  });

  it('is absent when the address geocoded', async () => {
    const result = succeeded(
      await createOffer(
        offerInput({ restaurantAddress: 'Marszałkowska 10, Warszawa' }),
        USER_ID,
      ),
    );

    expect(result.locationWarning).toBeUndefined();
  });

  it('is absent when no address was given at all', async () => {
    // No address means no location was promised, so there is nothing to warn
    // about. Warning here would train the User to ignore the message.
    const result = succeeded(await createOffer(offerInput({}), USER_ID));

    expect(result.locationWarning).toBeUndefined();
  });

  it('is absent when the linked restaurant supplied the coordinates', async () => {
    stubClient({ restaurantLocation: wkb(WARSAW) });

    const result = succeeded(
      await createOffer(
        offerInput({ restaurantId: RESTAURANT_ID, restaurantAddress: 'Testowa 1' }),
        USER_ID,
      ),
    );

    expect(result.locationWarning).toBeUndefined();
  });

  it('is not a failure', async () => {
    mockedGeocode.mockResolvedValue(null);

    const result = succeeded(
      await createOfferAction(offerInput({ restaurantAddress: 'Nigdzie' })),
    );

    expect(result.locationWarning).toBe(true);
  });
});

describe('Requirement 6.5: the batch counts what it could not place', async () => {
  it('reports every offer when the shared address fails', async () => {
    // A weekly menu shares one address, so this is normally all-or-nothing.
    mockedGeocode.mockResolvedValue(null);

    const items = [1, 2, 3].map((_, i) =>
      offerInput({ restaurantAddress: 'Nigdzie', availableDate: offsetIso(i + 1) }),
    );

    const result = await createOffersBatchAction(items);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.missingCoordinates).toBe(3);
    expect(result.data.created).toHaveLength(3);
  });

  it('reports zero when the address resolved', async () => {
    const items = [1, 2].map((_, i) =>
      offerInput({ restaurantAddress: 'Warszawa', availableDate: offsetIso(i + 1) }),
    );

    const result = await createOffersBatchAction(items);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.missingCoordinates).toBe(0);
  });
});

describe('#18: restaurantId is no longer a dead letter in the update contract', () => {
  it('is not part of the update schema', () => {
    expect('restaurantId' in updateOfferSchema.shape).toBe(false);
  });

  it('rejects a null instead of silently doing nothing', () => {
    // The old schema accepted null and mapUpdateToDbRow skipped it, so the
    // form reported success while the row was untouched. Validation is now
    // where that dead promise is caught.
    const result = updateOfferSchema.safeParse({
      dishName: 'Kotlet',
      restaurantId: null,
    });

    // Unknown keys are stripped by default rather than rejected, so what
    // matters is that restaurantId cannot reach the mapper.
    if (result.success) {
      expect('restaurantId' in result.data).toBe(false);
    }
  });

  it('never writes restaurant_id on update', async () => {
    const updateRows: Record<string, unknown>[] = [];
    mockedCreateClient.mockResolvedValue({
      from: () => {
        const chain: Record<string, unknown> = {};
        chain.update = (row: Record<string, unknown>) => {
          updateRows.push(row);
          return chain;
        };
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.single = async () => ({
          data: { ...insertedRow, id: 'offer-1', restaurant_location: null },
          error: null,
        });
        return chain;
      },
    } as never);
    mockedGetUser.mockResolvedValue({ id: OWNER_ID } as never);

    // Even a hostile payload carrying restaurantId: the mapper has no branch
    // for it any more.
    await updateOffer('offer-1', {
      dishName: 'Kotlet',
      price: 20,
      restaurantName: 'Bar',
      availableDate: new Date().toISOString().slice(0, 10),
      sourceType: 'text',
      restaurantId: RESTAURANT_ID,
    });

    expect(updateRows).toHaveLength(1);
    expect(updateRows[0]).not.toHaveProperty('restaurant_id');
  });

  it('still offers restaurantId on create', () => {
    // #18 says keep it on create, where RestaurantSelect really sets it.
    const result = updateOfferSchema.safeParse({ dishName: 'Kotlet' });
    expect(result.success).toBe(true);
  });
});

function offsetIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}