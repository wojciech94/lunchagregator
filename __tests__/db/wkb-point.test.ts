/**
 * #43 against the real database.
 *
 * `parseLocation` in services/offers.ts parsed only GeoJSON and WKT. PostgREST
 * returns WKB hex for a `GEOGRAPHY(POINT, 4326)` column, so every offer with
 * coordinates read back reported `restaurantLocation: null`. Unit tests missed
 * it because fixtures supply the WKT string a server never sends.
 *
 * This closes that gap: the value asserted on is whatever the database actually
 * produced, not a literal written by hand.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parsePostGisPoint } from '@/lib/postgis';
import { adminClient, runToken } from './helpers';

const admin = adminClient();
const token = runToken('db-wkb');
const today = new Date().toISOString().slice(0, 10);

/** ~40km outside Warsaw: distance-query.test.ts asserts a nearest-first order. */
const FAR = { lon: 21.9, lat: 52.6 };

const insertedIds: string[] = [];

async function insertWith(location: unknown): Promise<string> {
  const row: Record<string, unknown> = {
    dish_name: 'probe',
    price: 1,
    restaurant_name: 'probe',
    available_date: today,
    source_type: 'text',
    session_token: token,
  };
  if (location !== undefined) row.restaurant_location = location;

  const { data, error } = await admin
    .from('lunch_offers')
    .insert(row)
    .select('id')
    .single();
  if (error) throw new Error(`insert failed: ${error.message}`);
  insertedIds.push(data.id);
  return data.id;
}

async function readRaw(id: string): Promise<unknown> {
  const { data, error } = await admin
    .from('lunch_offers')
    .select('restaurant_location')
    .eq('id', id)
    .single();
  if (error) throw new Error(`read failed: ${error.message}`);
  return data!.restaurant_location;
}

beforeAll(async () => {
  // WKT and EWKT are both accepted on insert. Recorded here so that if a
  // future PostgREST changes one of them, this fails rather than silently
  // leaving the parser covering a shape that can no longer occur.
  await insertWith(`POINT(${FAR.lon} ${FAR.lat})`);
  await insertWith(`SRID=4326;POINT(${FAR.lon} ${FAR.lat})`);
  await insertWith(undefined);
});

afterAll(async () => {
  await admin.from('lunch_offers').delete().eq('session_token', token);
});

describe('#43: the shape the database actually sends', () => {
  it('is WKB hex, not the WKT the old parser expected', async () => {
    const [wkt, ewkt] = insertedIds;
    const fromWkt = await readRaw(wkt);
    const fromEwkt = await readRaw(ewkt);

    expect(typeof fromWkt).toBe('string');
    // The assertion that matters: neither contains "POINT(", so the old regex
    // could not have matched either.
    expect(fromWkt).not.toContain('POINT');
    expect(fromEwkt).toBe(fromWkt);
  });

  it('is parsed into the right coordinates', async () => {
    for (const id of insertedIds.slice(0, 2)) {
      const point = parsePostGisPoint(await readRaw(id));
      expect(point).not.toBeNull();
      expect(point!.longitude).toBeCloseTo(FAR.lon, 6);
      expect(point!.latitude).toBeCloseTo(FAR.lat, 6);
    }
  });

  it('returns null for a row that genuinely has no coordinates', async () => {
    const raw = await readRaw(insertedIds[2]);
    expect(raw).toBeNull();
    expect(parsePostGisPoint(raw)).toBeNull();
  });
});

describe('#43: parseLocation end to end', () => {
  it('reports coordinates for an offer that has them', async () => {
    // This is the user-visible defect: offer details said "no location" for an
    // offer whose coordinates were in the database.
    const id = insertedIds[0];
    const { data, error } = await admin
      .from('lunch_offers')
      .select('*')
      .eq('id', id)
      .single();
    expect(error).toBeNull();

    const point = parsePostGisPoint(data!.restaurant_location);
    expect(point).toEqual({ longitude: FAR.lon, latitude: FAR.lat });
  });
});