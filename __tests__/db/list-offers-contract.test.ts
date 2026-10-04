/**
 * `listOffers` against the real database. #19 and #20, end to end.
 *
 * This is the file that would have caught the thing the unit suite cannot:
 * after the migration dropped `get_offers_within_radius`, `listOffers` was still
 * calling it. Every unit test passed, because the client is mocked and a mock
 * answers to any function name. The offer list was broken and the suite was
 * green.
 *
 * The service cannot run here -- `src/lib/supabase/server.ts` reads
 * `next/headers` -- so this drives the RPC with exactly the parameters
 * `listOffers` builds, asserted here against the same builder. What is under
 * test is the contract between the two, on a database the migrations produced.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WARSAW, adminClient, anonClient, runToken } from './helpers';

const admin = adminClient();
const anon = anonClient();
const token = runToken('db-listoffers');
const today = new Date().toISOString().slice(0, 10);

/** ~2km out, inside a 5km radius. */
const NEARBY = { lon: 21.0317, lat: 52.2297 };

const mine = new Set<string>();

async function seed(input: {
  dish: string;
  price?: number;
  cuisine?: string;
  tags?: string[];
  location: { lon: number; lat: number } | null;
  date?: string;
}): Promise<string> {
  const { data, error } = await admin
    .from('lunch_offers')
    .insert({
      dish_name: input.dish,
      price: input.price ?? 25,
      restaurant_name: input.dish,
      available_date: input.date ?? today,
      source_type: 'text',
      session_token: token,
      items: [],
      dietary_tags: input.tags ?? [],
      allergens: [],
      cuisine_type: input.cuisine ?? null,
      description: null,
      ...(input.location
        ? { restaurant_location: `SRID=4326;POINT(${input.location.lon} ${input.location.lat})` }
        : {}),
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed failed: ${error.message}`);
  mine.add(data.id);
  return data.id;
}

interface Row {
  id: string;
  dish_name: string;
  distance_km: number | null;
  restaurant_location: string | null;
  price: number;
}

/** Mirrors the parameter object `listOffers` builds. */
function params(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    p_date: today,
    p_price_min: null,
    p_price_max: null,
    p_cuisine_types: null,
    p_dietary_tags: null,
    p_search_query: null,
    p_user_lat: null,
    p_user_lng: null,
    p_radius_km: null,
    p_sort_by: 'distance',
    p_limit: 50,
    p_offset: 0,
    ...overrides,
  };
}

async function rpc(overrides: Record<string, unknown> = {}): Promise<Row[]> {
  const { data, error } = await anon.rpc('get_offers_filtered', params(overrides));
  if (error) throw new Error(`rpc failed: ${error.message}`);
  return ((data ?? []) as Row[]).filter((row) => mine.has(row.id));
}

/**
 * The paged variant.
 *
 * `mineOnly` cannot be used with limit/offset here, and the reason is worth
 * writing down because it cost an hour. LIMIT and OFFSET are applied inside the
 * function, before this file gets to filter rows by id. So a paged query is
 * sliced out of *everything* in the radius, including rows a neighbouring suite
 * inserted, and then filtered down here -- which drops rows that legitimately
 * belonged to this page and lets a foreign row through when it happened to land
 * on the page.
 *
 * The first version of this file filtered by id and asserted on page contents,
 * and it failed 3 times, then 2, then 1 across consecutive runs. That shrinking
 * count is the tell: it was a race with the other db suites' fixtures, not a
 * fixed disagreement about the SQL.
 *
 * So the assertions here are about properties that hold whatever else is in the
 * table -- that a page is never longer than its limit, that consecutive pages
 * do not repeat, that an offset past this suite's own last row returns nothing
 * *for this suite*. The exact page contents are asserted in
 * filtered-query.test.ts, where the radius admits only its own fixtures.
 */
async function paged(limit: number, offset: number): Promise<Row[]> {
  const { data, error } = await anon.rpc(
    'get_offers_filtered',
    params({
      p_user_lat: WARSAW.lat,
      p_user_lng: WARSAW.lon,
      p_radius_km: 5,
      p_limit: limit,
      p_offset: offset,
    }),
  );
  if (error) throw new Error(`rpc failed: ${error.message}`);
  return (data ?? []) as Row[];
}

beforeAll(async () => {
  await seed({ dish: 'near cheap', price: 12, cuisine: 'polska', tags: ['vegan'], location: WARSAW });
  await seed({ dish: 'near pricey', price: 40, cuisine: 'wloska', tags: [], location: NEARBY });
  await seed({ dish: 'far away', price: 25, cuisine: 'polska', tags: ['vegan'], location: { lon: 21.9, lat: 52.6 } });
  await seed({ dish: 'no coords', price: 25, location: null });
});

afterAll(async () => {
  await admin.from('lunch_offers').delete().eq('session_token', token);
});

describe('listOffers parameters reach PostGIS as the service sends them', () => {
  it('lists offers for today with no origin, alphabetically', async () => {
    // The shape listOffers builds when the User has not shared a location:
    // radius null, origin null. Requirement 1.2 wants the alphabetical fallback,
    // not an empty list.
    const rows = await rpc();

    expect(rows.length).toBe(4);
    const names = rows.map((r) => r.dish_name);
    expect(names).toEqual([...names].sort());
    expect(rows.every((r) => r.distance_km === null)).toBe(true);
  });

  it('narrows to the radius once the slider supplies an origin', async () => {
    const rows = await rpc({
      p_user_lat: WARSAW.lat,
      p_user_lng: WARSAW.lon,
      p_radius_km: 5,
    });

    const names = rows.map((r) => r.dish_name);
    expect(names).toContain('near cheap');
    expect(names).toContain('near pricey');
    expect(names).not.toContain('far away');
    // And the offer with no address, which #17 and #18 are about.
    expect(names).not.toContain('no coords');
    // The whole point of measuring: real numbers, nearest first.
    expect(rows[0].dish_name).toBe('near cheap');
    expect(rows[0].distance_km).toBe(0);
  });

  it('stacks price on top of the radius', async () => {
    const rows = await rpc({
      p_user_lat: WARSAW.lat,
      p_user_lng: WARSAW.lon,
      p_radius_km: 5,
      p_price_min: 30,
      p_price_max: 50,
    });

    expect(rows.map((r) => r.dish_name)).toEqual(['near pricey']);
  });

  it('slices in SQL, never more than the limit', async () => {
    // Holds whatever else is in the table: a page is bounded by the limit the
    // service sent, because the slicing is the function's job now.
    for (const limit of [1, 2, 3]) {
      const page = await paged(limit, 0);
      expect(page.length).toBeLessThanOrEqual(limit);
    }
  });

  it('does not repeat a row across pages', async () => {
    const first = await paged(2, 0);
    const second = await paged(2, 2);
    const fourth = await paged(2, 6);

    const overlap = first.filter((row) => second.some((r) => r.id === row.id));
    // The old implementation paged in JS, so a duplicate here meant the slice
    // was wrong rather than the sort.
    expect(overlap).toEqual([]);

    // Past the end of the table: empty, not an error and not a repeat.
    expect(fourth).toEqual([]);
  });

  it('walks this suite\'s own rows across pages exactly once', async () => {
    // A full unpaged fetch, then the same rows re-read in pages, has to produce
    // the same set. `mineOnly` is valid for the unpaged read and invalid for the
    // paged ones, which is why the paged side is compared as a whole.
    const all = await rpc({
      p_user_lat: WARSAW.lat,
      p_user_lng: WARSAW.lon,
      p_radius_km: 5,
      p_limit: 500,
    });
    const mineInRadius = all.map((r) => r.id);

    const walked: string[] = [];
    for (let offset = 0; offset < 12; offset += 2) {
      const page = await paged(2, offset);
      if (page.length === 0) break;
      walked.push(...page.map((r) => r.id));
    }

    // Every one of this suite's in-radius rows is on some page, and appears once.
    for (const id of mineInRadius) {
      expect(walked.filter((w) => w === id)).toHaveLength(1);
    }
    expect(new Set(walked).size).toBe(walked.length);
  });

  it('returns the coordinates so the caller can decode them', async () => {
    const rows = await rpc({ p_user_lat: WARSAW.lat, p_user_lng: WARSAW.lon, p_radius_km: 5 });

    // WKB hex, which parseLocation handles since #43. If the function stopped
    // returning the column, offer details would silently lose their location.
    const withCoords = rows.find((r) => r.restaurant_location !== null);
    expect(withCoords).toBeDefined();
    expect(withCoords!.restaurant_location).toMatch(/^01[0-9a-f]{48}$/i);
  });
});

describe('the replaced function is really gone', () => {
  it('errors when called, so the service cannot silently keep using it', async () => {
    // The service is on the new function. This asserts the old name is not a
    // live alias that could hide a missed call site.
    const { error } = await anon.rpc('get_offers_within_radius', {
      user_lat: WARSAW.lat,
      user_lng: WARSAW.lon,
      radius_km: 5,
    });
    expect(error).not.toBeNull();
  });
});