import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, signInIdentity, runToken, todayUtc, ADMIN_CLAIM } from './helpers';

const service = adminClient();
const token = runToken('generic-import');
let operator: SupabaseClient; let regular: SupabaseClient;
const users: string[] = []; let restaurantId: string; let revision: string | null = null;
const url = 'https://example.org/menu';
const trial = () => ({ supported: true, fetchedAt: new Date().toISOString(), excerpt: 'Lunch Zupa 31 zł',
  finalUrl: url, identityEvidence: 'Fixture branch', limitations: [], dishes: [{ name: 'Zupa', price: 31 }] });
function configure(action: string, patch: Record<string, unknown> = {}, client = operator) {
  return client.rpc('configure_generic_import_source', { p_restaurant_id: restaurantId, p_revision: revision,
    p_expected_name: token, p_expected_address: 'Fixture branch', p_action: action, p_url: url,
    p_trial: null, p_evidence: 'Admin checked exact branch and menu freshness.', p_confirmed: true, ...patch });
}
beforeAll(async () => {
  const a = await signInIdentity(token, ADMIN_CLAIM); operator = a.client; users.push(a.id);
  const b = await signInIdentity(token, null); regular = b.client; users.push(b.id);
  const row = await service.from('restaurants').insert({ name: token, address: 'Fixture branch', user_id: a.id }).select('id').single();
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
describe('generic source real database lifecycle', () => {
  it('denies regular users both RPC and direct RLS writes', async () => {
    expect((await configure('draft', {}, regular)).error).not.toBeNull();
    const direct = await regular.from('lunch_import_bindings').insert({ source_id: `html-${restaurantId}`, restaurant_id: restaurantId,
      source_url: url, source_name: token, source_address: 'Fixture branch', verified_name: token, verified_address: 'Fixture branch', verification_note: 'Unauthorized draft' });
    expect(direct.error).not.toBeNull();
  });
  it('saves an inactive draft, blocks missing/failed/stale trial and requires human evidence', async () => {
    const draft = await configure('draft'); expect(draft.error).toBeNull();
    expect(draft.data.enabled).toBe(false); revision = draft.data.revision;
    expect((await configure('confirm')).error).not.toBeNull();
    const failed = await configure('trial', { p_trial: { ...trial(), supported: false, limitations: ['Ambiguous branches'] } });
    expect(failed.error).toBeNull(); revision = failed.data.revision;
    expect((await configure('confirm')).error).not.toBeNull();
    const stale = await configure('trial', { p_trial: { ...trial(), fetchedAt: '2020-01-01T00:00:00Z' } });
    expect(stale.error).toBeNull(); revision = stale.data.revision;
    expect((await configure('confirm')).error).not.toBeNull();
    const fresh = await configure('trial', { p_trial: trial() }); expect(fresh.error).toBeNull(); revision = fresh.data.revision;
    expect((await configure('confirm', { p_confirmed: false })).error).not.toBeNull();
    expect((await configure('confirm', { p_evidence: '' })).error).not.toBeNull();
    const active = await configure('confirm'); expect(active.error).toBeNull(); revision = active.data.revision;
    expect(active.data).toMatchObject({ enabled: true, verified_by: users[0], source_id: `html-${restaurantId}` });
    expect((await regular.from('lunch_import_bindings').select('*').eq('restaurant_id', restaurantId)).data).toEqual([]);
  });
  it('retains corrections and retry identity through URL edits while rejecting old previews', async () => {
    const request = () => ({ p_source_id: `html-${restaurantId}`, p_item_key: 'a'.repeat(64), p_fetched_at: new Date().toISOString(),
      p_expected_name: token, p_expected_address: 'Fixture branch', p_binding_revision: revision,
      p_offer: { restaurant_id: restaurantId, dish_name: 'Zupa', price: 31, available_date: todayUtc() } });
    const old = request();
    const responses = await Promise.all([operator,operator,operator].map(c => c.rpc('create_lunch_import_offer', old)));
    responses.forEach(r => expect(r.error).toBeNull());
    expect(responses.filter(r => r.data.created)).toHaveLength(1);
    const offerId = responses[0].data.offer.id;
    expect((await operator.from('lunch_offers').update({ price: 29, dish_name: 'Manual correction' }).eq('id', offerId)).error).toBeNull();
    const draft = await configure('draft', { p_url: 'https://example.org/new-menu' });
    expect(draft.error).toBeNull(); revision = draft.data.revision;
    expect(draft.data).toMatchObject({ enabled: false, trial: null, verified_at: null });
    expect((await operator.rpc('create_lunch_import_offer', old)).error).not.toBeNull();
    expect((await configure('confirm')).error).not.toBeNull();
    const fresh = await configure('trial', { p_trial: { ...trial(), finalUrl: 'https://example.org/new-menu' } });
    expect(fresh.error).toBeNull(); revision = fresh.data.revision;
    const active = await configure('confirm'); expect(active.error).toBeNull(); revision = active.data.revision;
    const repeated = await operator.rpc('create_lunch_import_offer', request());
    expect(repeated.error).toBeNull(); expect(repeated.data.created).toBe(false);
    expect(repeated.data.offer).toMatchObject({ id: offerId, price: 29, dish_name: 'Manual correction' });
    const disabled = await configure('disable'); expect(disabled.error).toBeNull(); revision = disabled.data.revision;
    expect((await configure('confirm')).error).not.toBeNull();
  });
  it('rejects races, unsafe URL shape and reassignments; audits changes atomically', async () => {
    expect((await configure('draft', { p_revision: null })).error).not.toBeNull();
    expect((await configure('draft', { p_url: 'http://127.0.0.1' })).error).not.toBeNull();
    const audit = await operator.from('admin_audit_log').select('after').eq('record_id', restaurantId).eq('table_name', 'lunch_import_bindings');
    expect(audit.error).toBeNull(); expect(audit.data!.length).toBeGreaterThan(5);
    const direct = await operator.from('lunch_import_bindings').update({ source_id: 'html-00000000-0000-0000-0000-000000000000' }).eq('source_id', `html-${restaurantId}`);
    expect(direct.error).not.toBeNull();
    const convert = await operator.from('lunch_import_bindings').update({ source_id: 'sushi' }).eq('source_id', `html-${restaurantId}`);
    expect(convert.error).not.toBeNull();
    const draft = await configure('draft'); expect(draft.error).toBeNull(); revision = draft.data.revision;
    const t = await configure('trial', { p_trial: trial() }); expect(t.error).toBeNull(); revision = t.data.revision;
    const a = await configure('confirm'); expect(a.error).toBeNull(); revision = a.data.revision;
    const edit = await operator.from('restaurants').update({ address: 'Different branch' }).eq('id', restaurantId);
    expect(edit.error).toBeNull();
    const binding = await operator.from('lunch_import_bindings').select('*').eq('source_id', `html-${restaurantId}`).single();
    expect(binding.data.enabled).toBe(false); expect(binding.data.revision).not.toBe(revision);
    expect(binding.data.trial).toBeNull();
    revision = binding.data.revision;
  });
  it('disables a generic binding when its verifying account is deleted', async () => {
    const verifier = await signInIdentity(token, ADMIN_CLAIM); users.push(verifier.id);
    const draft = await configure('draft', { p_expected_address: 'Different branch' });
    expect(draft.error).toBeNull(); revision = draft.data.revision;
    const fresh = await configure('trial', { p_expected_address: 'Different branch', p_trial: trial() });
    expect(fresh.error).toBeNull(); revision = fresh.data.revision;
    const active = await configure('confirm', { p_expected_address: 'Different branch' }, verifier.client);
    expect(active.error).toBeNull(); revision = active.data.revision;
    expect((await service.auth.admin.deleteUser(verifier.id)).error).toBeNull();
    users.splice(users.indexOf(verifier.id), 1);
    const row = await service.from('lunch_import_bindings').select('*').eq('source_id', `html-${restaurantId}`).single();
    expect(row.data).toMatchObject({ enabled: false, verified_by: null });
  });
});
