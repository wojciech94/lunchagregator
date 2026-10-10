import { afterAll, beforeAll, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, anonClient, signInIdentity, runToken, todayUtc, ADMIN_CLAIM } from './helpers';
import { SUSHI_CORNER_URL, SUSHI_CORNER_ADDRESS } from '../../src/lib/lunch-import/sushi-corner';
const service = adminClient();
const token = runToken('sushi-corner');
const users: string[] = [];
let operator: SupabaseClient; let regular: SupabaseClient; let restaurantId: string;
let revision: string | null = null;
const name = `Sushi Corner ${token}`;
const trial = (month = '04') => ({ supported: true, limitations: [], fetchedAt: new Date().toISOString(),
  finalUrl: SUSHI_CORNER_URL, identityEvidence: SUSHI_CORNER_ADDRESS, excerpt: 'AI fixture: Set I 40 PLN',
  dishes: [{ name: 'Set I', price: 40 }], conditions: 'Monday–Friday 12–16',
  menuPdf: { assetUrl: `https://sushicorner.pl/wp-content/uploads/sites/7/2025/${month}/sushi-corner-lunch-menu-english.pdf`, contentHash: 'a'.repeat(64) } });
function configure(action: string, client = operator, patch: Record<string, unknown> = {}) {
  return client.rpc('configure_generic_import_source', { p_restaurant_id: restaurantId, p_revision: revision,
    p_expected_name: name, p_expected_address: SUSHI_CORNER_ADDRESS, p_action: action,
    p_url: SUSHI_CORNER_URL, p_trial: null, p_evidence: 'Exact branch and current availability verified by fixture Admin.', p_confirmed: true, ...patch });
}
function publish(date = todayUtc()) {
  return operator.rpc('create_lunch_import_offer', { p_source_id: `html-${restaurantId}`, p_item_key: 'c'.repeat(64),
    p_fetched_at: new Date().toISOString(), p_expected_name: name, p_expected_address: SUSHI_CORNER_ADDRESS,
    p_binding_revision: revision, p_offer: { restaurant_id: restaurantId, dish_name: 'Set I', price: 40, available_date: date } });
}
beforeAll(async () => {
  const a = await signInIdentity(token, ADMIN_CLAIM); operator = a.client; users.push(a.id);
  const b = await signInIdentity(token, null); regular = b.client; users.push(b.id);
  const row = await service.from('restaurants').insert({ name, address: SUSHI_CORNER_ADDRESS, user_id: a.id }).select('id').single();
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
it('protects PDF metadata and activation independently with RPC authorization and RLS', async () => {
  for (const client of [anonClient(), regular]) expect((await configure('draft', client)).error).not.toBeNull();
  const draft = await configure('draft'); expect(draft.error).toBeNull(); revision = draft.data.revision;
  expect((await publish()).error).not.toBeNull();
  const attempt = await configure('trial', operator, { p_trial: trial() }); expect(attempt.error).toBeNull(); revision = attempt.data.revision;
  expect(attempt.data.trial.menuPdf).toEqual(trial().menuPdf);
  expect((await configure('confirm', operator, { p_confirmed: false })).error).not.toBeNull();
  expect((await regular.from('lunch_import_bindings').update({ enabled: true }).eq('restaurant_id', restaurantId).select()).data).toEqual([]);
  const active = await configure('confirm'); expect(active.error).toBeNull(); revision = active.data.revision;
  expect(active.data.enabled).toBe(true);
});
it('preserves corrections, new dates and tombstones when the discovered PDF changes', async () => {
  const first = await publish(); expect(first.error).toBeNull(); expect(first.data.created).toBe(true);
  expect((await operator.from('lunch_offers').update({ dish_name: 'Corrected set', price: 39 }).eq('id', first.data.offer.id)).error).toBeNull();
  const attempt = await configure('trial', operator, { p_trial: trial('10') }); expect(attempt.error).toBeNull(); revision = attempt.data.revision;
  expect((await publish()).error).not.toBeNull();
  const active = await configure('confirm'); expect(active.error).toBeNull(); revision = active.data.revision;
  const retry = await publish(); expect(retry.error).toBeNull();
  expect(retry.data).toMatchObject({ created: false, offer: { id: first.data.offer.id, dish_name: 'Corrected set', price: 39 } });
  const nextDate = new Date(`${todayUtc()}T00:00:00Z`); nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const next = await publish(nextDate.toISOString().slice(0, 10)); expect(next.error).toBeNull(); expect(next.data.created).toBe(true);
  expect((await operator.from('lunch_offers').delete().eq('id', first.data.offer.id)).error).toBeNull();
  const deleted = await publish(); expect(deleted.error).toBeNull(); expect(deleted.data).toEqual({ created: false, offer: null });
});
