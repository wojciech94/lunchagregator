/**
 * `get_offers_filtered`, executed against PostGIS. #19.
 *
 * The point of the replacement is that every filter, the ordering and the slice
 * happen in one statement. So the assertions here are about combinations: the
 * filters that used to be applied in a second query, after the distance query
 * had already returned rows, and the ordering that used to be applied in JS.
 *
 * `distance-query.test.ts` covered the radius semantics of the function this
 * replaced. This covers the wider contract, including the cases the old shape
 * could not express at all -- a date other than today, and every filter
 * combined with a radius rather than alongside a separate fetch.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WARSAW, adminClient, anonClient, runToken } from './helpers';

const admin = adminClient();
const anon = anonClient();
const token = runToken('db-filtered');

/** ~2km north-east of the Warsaw point. */
const NEARBY = { lon: 21.0317, lat: 52.2297 };
/** ~40km out, so ordering assertions have room to separate rows. */
const FAR_AWAY = { lon: 21.9, lat: 52.6 };

const today = new Date().toISOString().slice(0, 10);

/**
 * Every id this suite inserted.
 *
 * One database, many files, and other suites leave rows behind while they run --
 * `distance-query.test.ts` seeds offers around Warsaw and `authorization.test.ts`
 * a probe. So an assertion about what the query returns has to be about *its*
 * rows, not the table's: the first version of this file compared whole result
 * sets and failed against a neighbour's fixtures. Scoping by id is also what
 * `deleteOffersWithToken` does, for the same reason.
 */
const mine = new Set<string>();

interface Seed {
  dish: string;
  price?: number;
  cuisine?: string;
  tags?: string[];
  description?: string;
  location: { lon: number; lat: number } | null;
  date?: string;
}

/** Inserted with the full column set, because the function returns full rows. */
async function seed(seedInput: Seed): Promise<string> {
  const { data, error } = await admin
    .from('lunch_offers')
    .insert({
      dish_name: seedInput.dish,
      price: seedInput.price ?? 25,
      restaurant_name: seedInput.dish.replace(/[^a-z]/gi, ' ').trim() || 'Test',
      available_date: seedInput.date ?? today,
      source_type: 'text',
      session_token: token,
      items: [],
      dietary_tags: seedInput.tags ?? [],
      allergens: [],
      cuisine_type: seedInput.cuisine ?? null,
      description: seedInput.description ?? null,
      ...(seedInput.location
        ? { restaurant_location: `SRID=4326;POINT(${seedInput.location.lon} ${seedInput.location.lat})` }
        : {}),
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed failed: ${error.message}`);
  mine.add(data.id);
  return data.id;
}

interface FilteredRow {
  id: string;
  dish_name: string;
  price: number;
  restaurant_name: string;
  distance_km: number | null;
  items: string[];
  dietary_tags: string[];
  source_type: string;
  user_id: string | null;
}

async function call(params: Record<string, unknown>): Promise<FilteredRow[]> {
  const { data, error } = await anon.rpc('get_offers_filtered', params);
  if (error) throw new Error(`rpc failed: ${error.message}`);
  return (data ?? []) as FilteredRow[];
}

/**
 * As `call`, narrowed to this suite's rows.
 *
 * Not usable with limit/offset. LIMIT and OFFSET are applied inside the function
 * before this filter runs, so a paged page is cut out of every row in the radius
 * -- including rows other suites inserted while this file ran -- and filtering
 * that page by id afterwards drops rows that were legitimately on it. Asserting
 * page contents through this helper produced failures that shrank from 3 to 2 to
 * 1 across consecutive runs, which is a race with other suites' fixtures rather
 * than a disagreement about the SQL.
 *
 * So the paged assertions below are properties that hold whatever else is in the
 * table: a page is never longer than its limit, consecutive pages do not repeat,
 * and an offset past the end returns nothing.
 */
async function mineOnly(p: Record<string, unknown>): Promise<FilteredRow[]> {
  const rows = await call(p);
  return rows.filter((row) => mine.has(row.id));
}



async function mineNames(params: Record<string, unknown>): Promise<string[]> {
  return (await mineOnly(params)).map((row) => row.dish_name);
}

beforeAll(async () => {
  await seed({ dish: 'alpha', price: 10, cuisine: 'polska', tags: ['vegan'], location: WARSAW, description: 'zupa jarska' });
  await seed({ dish: 'beta', price: 30, cuisine: 'wloska', tags: ['vegetarian', 'gluten-free'], location: NEARBY });
  await seed({ dish: 'gamma', price: 20, cuisine: 'azjatycka', tags: ['vegan', 'gluten-free'], location: FAR_AWAY });
  await seed({ dish: 'delta', price: 40, cuisine: 'polska', tags: [], location: null });
  await seed({ dish: 'epsilon', price: 50, cuisine: 'meksykanska', tags: ['vegan'], location: FAR_AWAY, date: futureIso(1) });
});

function futureIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

afterAll(async () => {
  await admin.from('lunch_offers').delete().eq('session_token', token);
});

describe('get_offers_filtered: returns full rows', () => {
  it('includes every column the offer list renders', async () => {
    const rows = await mineOnly({ p_date: today, p_sort_by: 'newest' });

    const row = rows.find((r) => r.dish_name === 'alpha');
    expect(row).toBeDefined();
    // The old function returned six columns and the service re-fetched the rest.
    // A full row is what makes the second query unnecessary.
    expect(row).toMatchObject({
      price: 10,
      restaurant_name: 'alpha',
      items: [],
      dietary_tags: ['vegan'],
      source_type: 'text',
      user_id: null,
    });
  });
});

describe('get_offers_filtered: date', () => {
  it('defaults to today', async () => {
    const names = await mineNames({});
    expect(names).toContain('alpha');
    expect(names).not.toContain('epsilon');
  });

  it('honours a date other than today', async () => {
    // The old function hardcoded CURRENT_DATE, so this returned zero rows
    // through the distance path -- a silent empty list, not an error.
    const names = await mineNames({ p_date: futureIso(1) });
    expect(names).toContain('epsilon');
    expect(names).not.toContain('alpha');
  });
});

describe('get_offers_filtered: filters combine with a radius', () => {
  it('applies the radius', async () => {
    const names = await mineNames({
      p_date: today,
      p_user_lat: WARSAW.lat,
      p_user_lng: WARSAW.lon,
      p_radius_km: 5,
    });
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
    expect(names).not.toContain('gamma');
    // No coordinates cannot be within a radius of anything.
    expect(names).not.toContain('delta');
  });

  it('applies price inside the radius query, not after it', async () => {
    // Within 5km of Warsaw: alpha at 10, beta at 30. A [15,25] band leaves
    // neither, which a filter applied after the fetch would still honour --
    // but only because the second query had no LIMIT to work around.
    const narrow = await mineNames({
      p_date: today,
      p_price_min: 15,
      p_price_max: 25,
      p_user_lat: WARSAW.lat,
      p_user_lng: WARSAW.lon,
      p_radius_km: 5,
    });
    expect(narrow).toEqual([]);

    const wide = await mineNames({
      p_date: today,
      p_price_min: 5,
      p_price_max: 35,
      p_user_lat: WARSAW.lat,
      p_user_lng: WARSAW.lon,
      p_radius_km: 5,
    });
    expect(wide.sort()).toEqual(['alpha', 'beta']);
  });

  it('applies cuisine as OR within the list', async () => {
    const names = await mineNames({ p_date: today, p_cuisine_types: ['polska', 'wloska'] });
    expect(names.sort()).toEqual(['alpha', 'beta', 'delta']);
  });

  it('applies dietary tags as AND across them', async () => {
    const names = await mineNames({ p_date: today, p_dietary_tags: ['vegan', 'gluten-free'] });
    // Only gamma carries both.
    expect(names).toEqual(['gamma']);
  });

  it('searches dish name and description', async () => {
    expect(await mineNames({ p_date: today, p_search_query: 'amm' })).toEqual(['gamma']);
    expect(await mineNames({ p_date: today, p_search_query: 'jarska' })).toEqual(['alpha']);
  });

  it('stacks every filter at once', async () => {
    const names = await mineNames({
      p_date: today,
      p_cuisine_types: ['polska'],
      p_dietary_tags: ['vegan'],
      p_price_min: 5,
      p_price_max: 15,
      p_search_query: 'alp',
    });
    expect(names).toEqual(['alpha']);
  });
});

describe('get_offers_filtered: ordering', () => {
  it('is nearest-first when a radius and location are given', async () => {
    const rows = await mineOnly({
      p_date: today,
      p_user_lat: WARSAW.lat,
      p_user_lng: WARSAW.lon,
      p_radius_km: 60,
    });
    const distances = rows.map((r) => r.distance_km!);
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]);
    }
    expect(rows[0].dish_name).toBe('alpha');
  });

  it('orders by distance across the whole result, not only the rows of this suite', async () => {
    // Regression test for a real bug in the function.
    //
    // `ORDER BY distance_km` written directly in a plpgsql RETURN QUERY binds
    // that name to the OUT parameter declared by RETURNS TABLE, which is NULL
    // for every row while the sort runs. Every row therefore ties and Postgres
    // falls through to the next key -- restaurant_name -- so the function
    // returned rows in alphabetical order while reporting real distances. It
    // looked plausible, because the reported distance_km was correct; only the
    // order was wrong.
    //
    // Asserted on the raw result rather than this suite's rows, because the bug
    // was global and would show anywhere. A test scoped to this suite's four rows
    // passed even while the function was wrong, because its dish names happen to
    // be alphabetical in roughly the same order as their distances -- so scoping
    // alone would not have caught it.
    //
    // Confirmed by observing the function directly: 3 order violations before the
    // subquery was added, 0 after.
    const { data, error } = await anon.rpc('get_offers_filtered', {
      p_date: today,
      p_user_lat: WARSAW.lat,
      p_user_lng: WARSAW.lon,
      p_radius_km: 60,
      p_limit: 500,
    });
    expect(error).toBeNull();

    const rows = data as { dish_name: string; distance_km: number | null }[];
    expect(rows.length).toBeGreaterThan(1);

    const distances = rows.map((r) => Number(r.distance_km));
    const violations = distances.filter((d, i) => i > 0 && d < distances[i - 1]);
    // Names, so a failure says which row was out of place.
    expect(violations).toEqual([]);
    expect(distances[0]).toBe(0);
  });

  it('is alphabetical by restaurant when there is no location', async () => {
    // Requirement 1.2.
    const names = await mineNames({ p_date: today, p_sort_by: 'distance' });
    expect(names).toEqual([...names].sort());
  });

  it('honours price_asc and price_desc', async () => {
    const asc = await mineOnly({ p_date: today, p_sort_by: 'price_asc' });
    const ascPrices = asc.map((r) => Number(r.price));
    for (let i = 1; i < ascPrices.length; i++) {
      expect(ascPrices[i]).toBeGreaterThanOrEqual(ascPrices[i - 1]);
    }

    const desc = await mineOnly({ p_date: today, p_sort_by: 'price_desc' });
    const descPrices = desc.map((r) => Number(r.price));
    for (let i = 1; i < descPrices.length; i++) {
      expect(descPrices[i]).toBeLessThanOrEqual(descPrices[i - 1]);
    }
  });

  it('ignores a radius with no location rather than blanking the list', async () => {
    // The slider always sends a radius, so first paint has no location yet.
    // Treating that as "no results" would show an empty list to every visitor
    // whose location has not resolved.
    const rows = await mineOnly({ p_date: today, p_radius_km: 5 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.distance_km === null)).toBe(true);
  });
});

describe('get_offers_filtered: slicing happens in SQL', () => {
  it('returns the whole set when unpaged', async () => {
    const all = await mineOnly({ p_date: today });
    expect(all).toHaveLength(4);
  });

  it('never returns more than the limit asked for', async () => {
    // Stated as a bound rather than an exact count, because other suites' rows
    // are in the same table and the limit applies to those too. See the note on
    // mineOnly.
    for (const limit of [1, 2, 3]) {
      const page = await call({ p_date: today, p_limit: limit, p_offset: 0 });
      expect(page.length).toBeLessThanOrEqual(limit);
    }
  });

  it('does not repeat a row across pages', async () => {
    const first = await call({ p_date: today, p_limit: 2, p_offset: 0 });
    const second = await call({ p_date: today, p_limit: 2, p_offset: 2 });

    for (const row of first) {
      expect(second.some((r) => r.id === row.id)).toBe(false);
    }
  });

  it('returns an empty page past the end rather than erroring', async () => {
    expect(await call({ p_date: today, p_limit: 10, p_offset: 500 })).toEqual([]);
  });

  it('reaches every row of an unpaged set by walking pages', async () => {
    // The property that actually matters for a User paging through the list: no
    // row is skipped, none appears twice.
    const all = await mineOnly({ p_date: today });

    const walked: string[] = [];
    for (let offset = 0; offset < 40; offset += 2) {
      const page = await call({ p_date: today, p_limit: 2, p_offset: offset });
      if (page.length === 0) break;
      walked.push(...page.map((r) => r.id));
    }

    expect(new Set(walked).size).toBe(walked.length);
    // Every id of this suite's four rows is on some page exactly once.
    for (const row of all) {
      expect(walked.filter((id) => id === row.id)).toHaveLength(1);
    }
  });
});

describe('get_offers_filtered: the replaced function is gone', () => {
  it('no longer exists', async () => {
    // Leaving two ways to ask the same question is how the service ends up
    // calling the wrong one.
    const { error } = await anon.rpc('get_offers_within_radius', {
      user_lat: WARSAW.lat,
      user_lng: WARSAW.lon,
      radius_km: 5,
    });
    expect(error).not.toBeNull();
  });
});

describe('get_offers_filtered: readable by anon', () => {
  it('serves the public read policy', async () => {
    const { data, error } = await anon.rpc('get_offers_filtered', { p_date: today });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });
});
