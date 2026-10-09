import { afterAll, beforeAll, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, anonClient, signInIdentity, runToken, todayUtc, ADMIN_CLAIM } from './helpers';
import { MEATOLOGIA_URL, MEATOLOGIA_ADDRESS } from '../../src/lib/lunch-import/meatologia';
const service = adminClient();
const token = runToken('meatologia');
const users: string[] = [];
let operator: SupabaseClient; let regular: SupabaseClient; let restaurantId: string;
let revision: string | null = null;
const name = `Meatologia ${token}`;
const trial = (asset = 'lunch.jpg?v=1') => ({ supported: true, limitations: [], fetchedAt: new Date().toISOString(),
  finalUrl: MEATOLOGIA_URL, identityEvidence: MEATOLOGIA_ADDRESS, excerpt: 'Stek 59 PLN',
  dishes: [{ name: 'Stek', price: 59 }], conditions: 'w dni robocze do 16:00',
  menuImage: { assetUrl: `https://cdn.shopify.com/s/files/1/0930/9054/5989/files/${asset}`, contentHash: 'a'.repeat(64) } });
function configure(action: string, client = operator, patch: Record<string, unknown> = {}) {
  return client.rpc('configure_generic_import_source', { p_restaurant_id: restaurantId, p_revision: revision,
    p_expected_name: name, p_expected_address: MEATOLOGIA_ADDRESS, p_action: action,
    p_url: MEATOLOGIA_URL, p_trial: null, p_evidence: 'Exact branch and current availability verified by fixture Admin.', p_confirmed: true, ...patch });
}
function publish(date = todayUtc()) {
  return operator.rpc('create_lunch_import_offer', { p_source_id: `html-${restaurantId}`, p_item_key: 'b'.repeat(64),
    p_fetched_at: new Date().toISOString(), p_expected_name: name, p_expected_address: MEATOLOGIA_ADDRESS,
    p_binding_revision: revision, p_offer: { restaurant_id: restaurantId, dish_name: 'Stek', price: 59, available_date: date } });
}
beforeAll(async () => {
  const a = await signInIdentity(token, ADMIN_CLAIM); operator = a.client; users.push(a.id);
  const b = await signInIdentity(token, null); regular = b.client; users.push(b.id);
  const row = await service.from('restaurants').insert({ name, address: MEATOLOGIA_ADDRESS, user_id: a.id }).select('id').single();
  if (row.error) throw row.error; restaurantId = row.data.id;
});
afterAll(async () => {
  if (restaurantId) {
    await service.from('lunch_offers').delete().eq('restaurant_id', restaurantId);
    await service.from('restaurants').delete().eq('id', restaurantId);
    await service.from('admin_audit_log').delete().eq('record_id', restaurantId);
  }
  for (const id of users) await service.auth.admin.deleteUser(id);
});
it('protects image-source lifecycle and evidence with RPC authorization and RLS', async () => {
  for (const client of [anonClient(), regular]) {
    expect((await configure('draft', client)).error).not.toBeNull();
  }
  const draft = await configure('draft'); expect(draft.error).toBeNull(); revision = draft.data.revision;
  expect((await publish()).error).not.toBeNull();
  const attempt = await configure('trial', operator, { p_trial: trial() }); expect(attempt.error).toBeNull(); revision = attempt.data.revision;
  expect(attempt.data.trial.menuImage).toEqual(trial().menuImage);
  expect((await configure('confirm', operator, { p_confirmed: false })).error).not.toBeNull();
  expect((await regular.from('lunch_import_bindings').update({ enabled: true }).eq('restaurant_id', restaurantId).select()).data).toEqual([]);
  const active = await configure('confirm'); expect(active.error).toBeNull(); revision = active.data.revision;
  expect(active.data.enabled).toBe(true);
});
it('preserves corrections across image URL changes and retries, supports new dates and tombstones', async () => {
  const first = await publish(); expect(first.error).toBeNull(); expect(first.data.created).toBe(true);
  expect((await operator.from('lunch_offers').update({ dish_name: 'Corrected steak', price: 58 }).eq('id', first.data.offer.id)).error).toBeNull();
  const oldRevision = revision;
  const attempt = await configure('trial', operator, { p_trial: trial('new-lunch.jpg?v=2') });
  expect(attempt.error).toBeNull(); revision = attempt.data.revision;
  expect((await publish()).error).not.toBeNull();
  const active = await configure('confirm'); expect(active.error).toBeNull(); revision = active.data.revision;
  expect(revision).not.toBe(oldRevision);
  const retry = await publish(); expect(retry.error).toBeNull();
  expect(retry.data).toMatchObject({ created: false, offer: { id: first.data.offer.id, dish_name: 'Corrected steak', price: 58 } });
  const nextDate = new Date(`${todayUtc()}T00:00:00Z`); nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const next = await publish(nextDate.toISOString().slice(0, 10)); expect(next.error).toBeNull(); expect(next.data.created).toBe(true);
  expect(next.data.offer.id).not.toBe(first.data.offer.id);
  expect((await operator.from('lunch_offers').delete().eq('id', first.data.offer.id)).error).toBeNull();
  const deletedRetry = await publish();
  expect(deletedRetry.error).toBeNull(); expect(deletedRetry.data).toEqual({ created: false, offer: null });
});
