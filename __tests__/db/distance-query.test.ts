/**
 * The distance query, executed against PostGIS.
 *
 * This is the first test in the repo that can tell a correct distance filter
 * from a plausible one. `__tests__/properties/restaurant-filtering.property.test.ts`
 * asserts against `haversineDistance`, a function written inside the test file,
 * so it passes whether or not the shipped SQL agrees with it. Everything below
 * runs the shipped function.
 *
 * `get_offers_within_radius` is replaced in #19 by `get_offers_filtered`, which
 * folds every filter into one ordered, sliced function. This suite is written
 * against the contract rather than the signature, so #19 changed only the call
 * site here. What the wider function can do that this one could not is covered
 * in filtered-query.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WARSAW, adminClient, anonClient, deleteOffersWithToken, insertOffer, runToken, todayUtc } from './helpers';

const admin = adminClient();
const anon = anonClient();
const token = runToken('db-distance');

// Krakow, roughly 295 km straight-line from the Warsaw point below.
const KRAKOW = { lon: 19.945, lat: 50.0647 };

const inserted: string[] = [];

beforeAll(async () => {
  const seeds = [
    { dishName: 'at the origin', location: WARSAW },
    { dishName: 'two km away', location: { lon: 21.0317, lat: 52.2297 } },
    { dishName: 'in Krakow', location: KRAKOW },
    { dishName: 'no coordinates', location: null },
  ];

  for (const seed of seeds) {
    const { id } = await insertOffer(admin, { ...seed, sessionToken: token });
    inserted.push(id);
  }
});

afterAll(async () => {
  await deleteOffersWithToken(admin, token);
});

interface RadiusRow {
  id: string;
  dish_name: string;
  distance_km: number;
}

/**
 * Calls the replacement function (#19), which took the radius and returned
 * everything else separately. The assertions below are about radius semantics,
 * which did not change; the wider contract -- dates, filters, slicing -- is in
 * filtered-query.test.ts.
 *
 * Scoped to this suite's rows on purpose. One database, many files:
 * `filtered-query.test.ts` also seeds an offer at exactly WARSAW, so an
 * assertion about the *first* row of an unbounded radius query would depend on
 * which file ran first. Scoping by id is the same discipline
 * `deleteOffersWithToken` uses.
 */
async function withinRadius(radiusKm: number): Promise<RadiusRow[]> {
  const { data, error } = await anon.rpc('get_offers_filtered', {
    p_date: todayUtc(),
    p_user_lat: WARSAW.lat,
    p_user_lng: WARSAW.lon,
    p_radius_km: radiusKm,
  });
  if (error) throw new Error(`rpc failed: ${error.message}`);
  const ours = ((data ?? []) as RadiusRow[]).filter((row) => inserted.includes(row.id));
  return ours;
}

describe('get_offers_filtered: radius semantics', () => {
  it('returns only offers inside the radius', async () => {
    const rows = await withinRadius(5);
    const names = rows.map((row) => row.dish_name);

    expect(names).toContain('at the origin');
    expect(names).toContain('two km away');
    expect(names).not.toContain('in Krakow');
  });

  it('orders by distance, nearest first', async () => {
    const rows = await withinRadius(5);
    const distances = rows.map((row) => row.distance_km);

    expect(distances.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < distances.length; i += 1) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]);
    }
    expect(rows[0].dish_name).toBe('at the origin');
  });

  it('reports the origin as zero distance', async () => {
    const rows = await withinRadius(5);
    const origin = rows.find((row) => row.dish_name === 'at the origin');
    expect(origin?.distance_km).toBe(0);
  });

  it('computes a real distance for an offer a couple of km away', async () => {
    const rows = await withinRadius(5);
    const nearby = rows.find((row) => row.dish_name === 'two km away');
    // ~1.4 km at this longitude offset. The bound is loose on purpose: the
    // point is that PostGIS produced something in the right order of
    // magnitude, not that it matches a hardcoded constant to the centimetre.
    expect(nearby?.distance_km).toBeGreaterThan(1);
    expect(nearby?.distance_km).toBeLessThan(2);
  });

  it('excludes offers with no coordinates at all', async () => {
    // This is the rule that makes geocoding load-bearing. An offer whose
    // address could not be resolved has a null restaurant_location and is
    // invisible to distance filtering -- which is why #5 moved geocoding
    // server-side and before INSERT.
    const rows = await withinRadius(25);
    expect(rows.map((row) => row.dish_name)).not.toContain('no coordinates');
  });

  it('widens with the radius', async () => {
    const narrow = await withinRadius(5);
    const wide = await withinRadius(500);
    expect(wide.length).toBeGreaterThan(narrow.length);
    expect(wide.map((row) => row.dish_name)).toContain('in Krakow');
  });

  it('rounds distance to one decimal place', async () => {
    const rows = await withinRadius(500);
    for (const row of rows) {
      expect(row.distance_km).toBe(Math.round(row.distance_km * 10) / 10);
    }
  });

  it('narrows to the origin when the radius is 500 metres', async () => {
    // The origin offer sits at distance 0, so it is inside any radius. The
    // meaningful assertion is that the offer two kilometres out drops out --
    // a radius that returned everything would pass a weaker version of this.
    const rows = await withinRadius(0.5);
    const ours = rows.filter((row) => inserted.includes(row.id));

    expect(ours.map((row) => row.dish_name)).toEqual(['at the origin']);
  });
});