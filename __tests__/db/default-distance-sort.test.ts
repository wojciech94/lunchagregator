import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, anonClient, deleteOffersWithToken, offerRow, runToken, todayUtc, WARSAW } from './helpers';

const admin = adminClient();
const anon = anonClient();
const token = runToken('db-default-distance');

beforeAll(async () => {
  const seeds = [
    { restaurantName: 'Z nearest', price: 40, location: WARSAW },
    { restaurantName: 'Y nearby', price: 30, location: { lon: WARSAW.lon + 0.02, lat: WARSAW.lat } },
    { restaurantName: 'A beyond radius', price: 20, location: { lon: WARSAW.lon + 1, lat: WARSAW.lat } },
    { restaurantName: 'B unknown', price: 10, location: null },
  ];
  const { error } = await admin.from('lunch_offers').insert(seeds.map(seed => offerRow({
    ...seed, dishName: token, sessionToken: token,
  })));
  if (error) throw error;
});
afterAll(async () => { await deleteOffersWithToken(admin, token); });

async function query(overrides: Record<string, unknown> = {}) {
  const { data, error } = await anon.rpc('get_offers_filtered', {
    p_date: todayUtc(), p_search_query: token,
    p_user_lat: WARSAW.lat, p_user_lng: WARSAW.lon,
    ...overrides,
  });
  if (error) throw error;
  return data as { restaurant_name: string; distance_km: number | null }[];
}

describe('location-aware default ordering independently of radius', () => {
  it('orders all located rows nearest first, retaining distant and unlocated rows', async () => {
    const rows = await query();
    expect(rows.map(row => row.restaurant_name)).toEqual(['Z nearest', 'Y nearby', 'A beyond radius', 'B unknown']);
    expect(rows[0].distance_km).toBe(0);
    expect(rows[1].distance_km).toBeGreaterThan(0);
    expect(rows[2].distance_km).toBeGreaterThan(25);
    expect(rows[3].distance_km).toBeNull();
  });

  it('slices after distance ordering', async () => {
    expect((await query({ p_limit: 1, p_offset: 1 })).map(row => row.restaurant_name)).toEqual(['Y nearby']);
  });

  it('falls back to alphabetical ordering with no origin and hides distances', async () => {
    const rows = await query({ p_user_lat: null, p_user_lng: null });
    expect(rows.map(row => row.restaurant_name)).toEqual(['A beyond radius', 'B unknown', 'Y nearby', 'Z nearest']);
    expect(rows.every(row => row.distance_km === null)).toBe(true);
  });

  it.each(['price_asc', 'price_desc'])('honours %s while applying the radius', async sort => {
    const rows = await query({ p_radius_km: 5, p_sort_by: sort });
    expect(rows.map(row => row.restaurant_name)).toEqual(sort === 'price_asc' ? ['Y nearby', 'Z nearest'] : ['Z nearest', 'Y nearby']);
    expect(rows.every(row => row.distance_km !== null)).toBe(true);
  });
});
