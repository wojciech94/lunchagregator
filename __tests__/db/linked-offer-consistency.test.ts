import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, anonClient, runToken, signInIdentity, todayUtc, ADMIN_CLAIM } from './helpers';

const admin = adminClient();
const token = runToken('linked-consistency');
const identities: string[] = [];
let restaurantId: string;
let owner: Awaited<ReturnType<typeof signInIdentity>>;
let other: Awaited<ReturnType<typeof signInIdentity>>;
let operator: Awaited<ReturnType<typeof signInIdentity>>;
const ids: Record<string, string> = {};

beforeAll(async () => {
  owner = await signInIdentity(token); identities.push(owner.id);
  other = await signInIdentity(token); identities.push(other.id);
  operator = await signInIdentity(token, ADMIN_CLAIM); identities.push(operator.id);
  const { data, error } = await owner.client.from('restaurants').insert({ name: token, address: 'Wroclaw', location: 'POINT(17.03 51.1)', cuisine_types: ['wloska'], user_id: owner.id }).select('id').single();
  if (error) throw error;
  restaurantId = data.id;
  for (const [kind, cuisine, location, address] of [
    ['snapshot', 'wloska', 'POINT(17.03 51.1)', 'Historical address'],
    ['explicit', 'polska', 'POINT(17.03 51.1)', 'Historical address'],
    ['legacy', null, null, null],
  ] as const) {
    const result = await owner.client.from('lunch_offers').insert({ dish_name: `${token}-${kind}`, price: 25, restaurant_id: restaurantId, restaurant_name: 'Historical name', restaurant_address: address, restaurant_location: location, cuisine_type: cuisine, available_date: todayUtc(), source_type: 'text', user_id: owner.id, session_token: token }).select('id').single();
    if (result.error) throw result.error;
    ids[kind] = result.data.id;
  }
});

afterAll(async () => {
  await admin.from('lunch_offers').delete().eq('session_token', token);
  if (restaurantId) await admin.from('restaurants').delete().eq('id', restaurantId);
  for (const id of identities) await admin.auth.admin.deleteUser(id);
});

describe('linked offer snapshots and discovery on real PostGIS', () => {
  it('filters the persisted dish cuisine rather than the current restaurant cuisine', async () => {
    const { data, error } = await anonClient().rpc('get_offers_filtered', { p_date: todayUtc(), p_search_query: token, p_cuisine_types: ['wloska'] });
    expect(error).toBeNull();
    expect(data.map((row: { id: string }) => row.id)).toEqual([ids.snapshot]);
    const { count, error: countError } = await anonClient().from('lunch_offers').select('*', { count: 'exact', head: true }).eq('available_date', todayUtc()).ilike('dish_name', `%${token}%`).in('cuisine_type', ['wloska']);
    expect(countError).toBeNull(); expect(count).toBe(data.length);
  });
  it('includes snapshots with coordinates and excludes a genuinely locationless legacy offer', async () => {
    const { data, error } = await anonClient().rpc('get_offers_filtered', { p_date: todayUtc(), p_search_query: token, p_user_lat: 51.1, p_user_lng: 17.03, p_radius_km: 1 });
    expect(error).toBeNull();
    expect(data.map((row: { id: string }) => row.id).sort()).toEqual([ids.snapshot, ids.explicit].sort());
    for (const row of data) expect(row.distance_km).toBeCloseTo(0, 5);
  });
  it('does not rewrite historical or legacy snapshots when a restaurant changes', async () => {
    const before = await owner.client.from('lunch_offers').select('*').eq('session_token', token).order('id');
    const update = await owner.client.from('restaurants').update({ name: 'Moved restaurant', address: 'New address', location: 'POINT(18 52)', cuisine_types: ['azjatycka'] }).eq('id', restaurantId);
    expect(update.error).toBeNull();
    const after = await owner.client.from('lunch_offers').select('*').eq('session_token', token).order('id');
    expect(after.error).toBeNull(); expect(after.data).toEqual(before.data);
  });
  it('retains owner/admin RLS and denies cross-user and anonymous snapshot writes', async () => {
    for (const client of [other.client, anonClient()]) {
      const result = await client.from('lunch_offers').update({ restaurant_address: 'Unauthorized' }).eq('id', ids.snapshot).select('id');
      expect(result.data ?? []).toHaveLength(0);
    }
    const own = await owner.client.from('lunch_offers').update({ description: 'Owner edit' }).eq('id', ids.snapshot).select('id');
    expect(own.error).toBeNull(); expect(own.data).toHaveLength(1);
    const privileged = await operator.client.from('lunch_offers').update({ description: 'Admin edit' }).eq('id', ids.snapshot).select('id');
    expect(privileged.error).toBeNull(); expect(privileged.data).toHaveLength(1);
  });
});
