/**
 * #17 against the real database.
 *
 * The unit tests prove `createOffer` asks for coordinates and puts them on the
 * row. They cannot prove PostGIS accepts that value for a
 * `GEOGRAPHY(POINT, 4326)` column, or that the row survives the
 * `trg_check_available_date` trigger. This does.
 *
 * What is verified here is the database, not the server layer: `next/headers`
 * has no meaning in a Vitest process, so `createOffer` cannot run here.
 * Talking to PostgREST directly with the exact row shape `mapOfferToDbRow`
 * produces is what this can honestly assert.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, anonClient, runToken } from './helpers';

const admin = adminClient();
const anon = anonClient();
const token = runToken('db-offer-geocode');
const today = new Date().toISOString().slice(0, 10);

const WARSAW = { lon: 21.0122, lat: 52.2297 };
/** ~40km north-east of Warsaw, far from the origin rows other suites seed. */
const FAR = { lon: 21.9, lat: 52.6 };
/**
 * Decodes the WKB PostgREST returns: a 1-byte order flag (01 = little-endian),
 * a 4-byte type, then lon and lat as float64 in that order.
 *
 * Written out rather than compared against a fixed literal, because the literal
 * would only encode whatever this machine happened to produce once.
 */
function decodeWkbPoint(value: string): { lon: number; lat: number } | null {
  const hex = value.replace(/^\s+|\s+$/g, '');
  // 50 hex characters: a 1-byte order flag (01 = little-endian), then a 4-byte
  // type and 4-byte SRID, then lon and lat as float64 (16 bytes).
  if (!/^01[0-9a-f]{48}$/i.test(hex)) return null;

  const bytes = hex.match(/.{2}/g)!.map((b) => parseInt(b, 16));
  const littleEndian = bytes[0] === 1;
  const view = new DataView(Uint8Array.from(bytes.slice(9)).buffer);
  const lon = view.getFloat64(0, littleEndian);
  const lat = view.getFloat64(8, littleEndian);
  return { lon, lat };
}

/**
 * Exactly what mapOfferToDbRow + pointString produce for a geocoded offer.
 *
 * The coordinates are deliberately ~40km from Warsaw. `distance-query.test.ts`
 * seeds offers around the origin and asserts a specific nearest-first order;
 * a leftover Warsaw row would tie with its origin offer and break that suite.
 * The visibility assertion below asks for this id by name rather than relying
 * on it being the closest row, so the distance does not matter here.
 */
function geocodedOfferRow() {
  return {
    dish_name: 'Kotlet schabowy',
    items: ['Zupa', 'Kotlet'],
    price: 24.9,
    restaurant_name: 'Bar Mleko',
    available_date: today,
    source_type: 'photo' as const,
    user_id: null,
    description: null,
    cuisine_type: null,
    dietary_tags: [],
    allergens: [],
    restaurant_address: 'Marszałkowska 10, Warszawa',
    restaurant_location: `POINT(${FAR.lon} ${FAR.lat})`,
    session_token: token,
  };
}

let insertedId: string | undefined;

beforeAll(async () => {
  const { data, error } = await admin
    .from('lunch_offers')
    .insert(geocodedOfferRow())
    .select('id')
    .single();
  if (error) throw new Error(`seed failed: ${error.message}`);
  insertedId = data.id;
});

afterAll(async () => {
  // Scoped to this run's token. Never by prefix: auth.spec.ts already leaves
  // rows behind on shared projects.
  await admin.from('lunch_offers').delete().eq('session_token', token);
});

describe('#17: a POINT(lon lat) string is accepted for restaurant_location', () => {
  it('stores the row and reads it back as WKB hex', async () => {
    const { data, error } = await admin
      .from('lunch_offers')
      .select('restaurant_location')
      .eq('id', insertedId!)
      .single();

    expect(error).toBeNull();
    // The documented shape matters: parseLocation() in services/offers.ts has
    // to recognise whatever comes back, and today it does not. Filed as #43.
    expect(typeof data!.restaurant_location).toBe('string');

    // WKB for a POINT: order flag 01 (little-endian), type 01000020 (4326),
    // then lon and lat. Decoding it proves the coordinates survived the round
    // trip rather than merely that a string came back.
    const point = decodeWkbPoint(data!.restaurant_location);
    expect(point).not.toBeNull();
    expect(point!.lon).toBeCloseTo(FAR.lon, 6);
    expect(point!.lat).toBeCloseTo(FAR.lat, 6);
  });

  it('is now visible to the distance query that filters IS NOT NULL', async () => {
    // The whole point of #17. Before it, an AI-added offer had
    // restaurant_location NULL and this function could never return it, which
    // is what made Requirements 1.1 and 6.5 unreachable.
    //
    // Queried from the offer's own point with a radius that reaches it but
    // nothing else, so the assertion does not depend on what other suites
    // have in the table.
    const { data, error } = await admin.rpc('get_offers_within_radius', {
      user_lat: FAR.lat,
      user_lng: FAR.lon,
      radius_km: 5,
    });
    expect(error).toBeNull();

    const ids = (data as { id: string }[]).map((r) => r.id);
    expect(ids).toContain(insertedId);
  });

  it('still reads publicly', async () => {
    const { data, error } = await anon
      .from('lunch_offers')
      .select('id')
      .eq('id', insertedId!)
      .single();
    expect(error).toBeNull();
    expect(data!.id).toBe(insertedId);
  });
});

describe('#17: an offer with no address saves without coordinates', () => {
  it('inserts and is simply absent from the distance query', async () => {
    const row = geocodedOfferRow();
    delete (row as Record<string, unknown>).restaurant_location;
    (row as Record<string, unknown>).dish_name = 'Bez adresu';

    const { data, error } = await admin
      .from('lunch_offers')
      .insert(row)
      .select('id, restaurant_location')
      .single();

    // Requirement 6.5: a missing or ungeocodable address saves the offer
    // anyway. It is absent from distance search, not rejected.
    expect(error).toBeNull();
    expect(data!.restaurant_location).toBeNull();

    const { data: found } = await admin.rpc('get_offers_within_radius', {
      user_lat: WARSAW.lat,
      user_lng: WARSAW.lon,
      radius_km: 5,
    });
    expect((found as { id: string }[]).map((r) => r.id)).not.toContain(data!.id);

    await admin.from('lunch_offers').delete().eq('id', data!.id);
  });
});