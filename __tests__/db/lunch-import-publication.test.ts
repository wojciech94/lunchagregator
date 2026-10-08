import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, signInIdentity, runToken, todayUtc, ADMIN_CLAIM } from './helpers';

const admin = adminClient();
const token = runToken('db-import');
const users: string[] = [];
let operator: SupabaseClient;
let secondOperator: SupabaseClient;
let regular: SupabaseClient;
let restaurantId: string;
beforeAll(async () => {
  for (const claim of [ADMIN_CLAIM, ADMIN_CLAIM, null]) {
    const identity = await signInIdentity(token, claim);
    users.push(identity.id);
    if (!operator) operator = identity.client;
    else if (!secondOperator) secondOperator = identity.client;
    else regular = identity.client;
  }
  const { data, error } = await admin.from('restaurants').insert({ name: token, address: 'Reviewed branch',
    user_id: users[0], location: 'SRID=4326;POINT(17.1 51.1)' }).select('id').single();
  if (error) throw error;
  restaurantId = data.id;
});
afterAll(async () => {
  if (restaurantId) {
    await admin.from('lunch_offers').delete().eq('restaurant_id', restaurantId);
    await admin.from('restaurants').delete().eq('id', restaurantId);
  }
  for (const id of users) await admin.auth.admin.deleteUser(id);
});
function request(itemKey: string, patch: Record<string, unknown> = {}) {
  return { p_source_id: 'sofa', p_item_key: itemKey.repeat(64), p_fetched_at: new Date().toISOString(),
    p_expected_name: token, p_expected_address: 'Reviewed branch', p_offer: {
      restaurant_id: restaurantId, restaurant_name: 'Forged client name', restaurant_address: 'Forged address',
      dish_name: 'Source dish', price: 31, available_date: todayUtc(), ...patch,
    } };
}
describe('import publication atomic linkage and RLS', () => {
  it('creates one offer under concurrent admins, then preserves manual corrections and snapshots', async () => {
    const responses = await Promise.all([operator, secondOperator, operator, secondOperator].map(client =>
      client.rpc('create_lunch_import_offer', request('a'))));
    for (const response of responses) expect(response.error).toBeNull();
    expect(responses.filter(response => response.data.created)).toHaveLength(1);
    expect(new Set(responses.map(response => response.data.offer.id)).size).toBe(1);
    const row = responses[0].data.offer;
    expect(row.restaurant_name).toBe(token);
    expect(row.restaurant_address).toBe('Reviewed branch');
    expect(row.restaurant_location).toBeTruthy();
    expect(users).toContain(row.user_id);
    const { error } = await operator.from('lunch_offers').update({ dish_name: 'Manual correction', price: 29, description: 'Reviewed' }).eq('id', row.id);
    expect(error).toBeNull();
    const repeated = await secondOperator.rpc('create_lunch_import_offer', request('a', { price: 99 }));
    expect(repeated.error).toBeNull();
    expect(repeated.data).toMatchObject({ created: false, offer: { id: row.id, price: 29, dish_name: 'Manual correction', description: 'Reviewed' } });
  });
  it('rolls back a failed claim and allows a safe retry of just that item', async () => {
    const failed = await operator.rpc('create_lunch_import_offer', request('b', { price: -1 }));
    expect(failed.error).not.toBeNull();
    const links = await operator.from('lunch_import_items').select('item_key').eq('restaurant_id', restaurantId).eq('item_key', 'b'.repeat(64));
    expect(links.data).toEqual([]);
    const successful = await operator.rpc('create_lunch_import_offer', request('b'));
    expect(successful.error).toBeNull(); expect(successful.data.created).toBe(true);
    const repeated = await operator.rpc('create_lunch_import_offer', request('b'));
    expect(repeated.error).toBeNull(); expect(repeated.data.created).toBe(false);
  });
  it('refuses an ordinary authenticated user in both the RPC and linkage RLS', async () => {
    const rejected = await regular.rpc('create_lunch_import_offer', request('c'));
    expect(rejected.error?.code).toBe('42501');
    const read = await regular.from('lunch_import_items').select('*').eq('restaurant_id', restaurantId);
    expect(read.error).toBeNull(); expect(read.data).toEqual([]);
    const write = await regular.from('lunch_import_items').insert({ restaurant_id: restaurantId, source_id: 'sofa',
      item_key: 'c'.repeat(64), available_date: todayUtc(), source_url: 'https://example.test', fetched_at: new Date().toISOString() });
    expect(write.error).not.toBeNull();
  });
  it('blocks changed bindings, past dates and expired previews without creating linkage', async () => {
    for (const patch of [{ p_expected_address: 'Other branch' }, { p_fetched_at: '2000-01-01T00:00:00Z' },
      { p_offer: { ...request('d').p_offer, available_date: '2000-01-01' } }]) {
      const response = await operator.rpc('create_lunch_import_offer', { ...request('d'), ...patch });
      expect(response.error).not.toBeNull();
    }
    const links = await operator.from('lunch_import_items').select('*').eq('restaurant_id', restaurantId).eq('item_key', 'd'.repeat(64));
    expect(links.data).toEqual([]);
  });
  it('retains a tombstone after manual deletion instead of silently recreating the offer', async () => {
    const created = await operator.rpc('create_lunch_import_offer', request('e'));
    expect(created.error).toBeNull();
    await operator.from('lunch_offers').delete().eq('id', created.data.offer.id);
    const repeated = await operator.rpc('create_lunch_import_offer', request('e'));
    expect(repeated.error).toBeNull(); expect(repeated.data).toEqual({ created: false, offer: null });
  });
  it('prevents an authenticated admin from deleting linkage to bypass idempotency', async () => {
    const created = await operator.rpc('create_lunch_import_offer', request('9'));
    expect(created.error).toBeNull();
    const removed = await operator.from('lunch_import_items').delete().eq('restaurant_id', restaurantId).eq('item_key', '9'.repeat(64));
    expect(removed.error?.code).toBe('42501');
    const repeated = await operator.rpc('create_lunch_import_offer', request('9'));
    expect(repeated.data).toMatchObject({ created: false, offer: { id: created.data.offer.id } });
  });
  it('preserves a manually changed date on retries and recognizes it on reimport for that day', async () => {
    const created = await operator.rpc('create_lunch_import_offer', request('f'));
    expect(created.error).toBeNull();
    const date = new Date(`${todayUtc()}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1);
    const correctedDate = date.toISOString().slice(0, 10);
    const correction = await operator.from('lunch_offers').update({ available_date: correctedDate }).eq('id', created.data.offer.id);
    expect(correction.error).toBeNull();
    const oldDay = await operator.rpc('create_lunch_import_offer', request('f'));
    expect(oldDay.data).toMatchObject({ created: false, offer: { id: created.data.offer.id, available_date: correctedDate } });
    const newDay = await operator.rpc('create_lunch_import_offer', request('f', { available_date: correctedDate }));
    expect(newDay.error).toBeNull();
    expect(newDay.data).toMatchObject({ created: false, offer: { id: created.data.offer.id, available_date: correctedDate } });
  });
});
