import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { normalizeImportIdentity } from '@/lib/lunch-import/identity';
import { adminClient, signInIdentity, runToken, todayUtc, ADMIN_CLAIM } from './helpers';

const admin = adminClient();
const token = runToken('db-import');
const users: string[] = [];
let operator: SupabaseClient;
let secondOperator: SupabaseClient;
let regular: SupabaseClient;
let restaurantId: string;
let bindingRevision: string;
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
  const configured = await configure('confirm', null);
  if (configured.error) throw configured.error;
  bindingRevision = configured.data.revision;
});
afterAll(async () => {
  if (restaurantId) {
    await admin.from('lunch_offers').delete().eq('restaurant_id', restaurantId);
    await admin.from('restaurants').delete().eq('id', restaurantId);
    await admin.from('admin_audit_log').delete().eq('record_id', restaurantId).eq('table_name', 'lunch_import_bindings');
  }
  for (const id of users) await admin.auth.admin.deleteUser(id);
});
function request(itemKey: string, patch: Record<string, unknown> = {}) {
  return { p_source_id: 'sofa', p_item_key: itemKey.repeat(64), p_fetched_at: new Date().toISOString(),
    p_binding_revision: bindingRevision,
    p_expected_name: token, p_expected_address: 'Reviewed branch', p_offer: {
      restaurant_id: restaurantId, restaurant_name: 'Forged client name', restaurant_address: 'Forged address',
      dish_name: 'Source dish', price: 31, available_date: todayUtc(), ...patch,
    } };
}
function configure(action: 'confirm' | 'disable', revision: string | null = bindingRevision, client = operator,
  patch: Record<string, unknown> = {}) {
  return client.rpc('configure_lunch_import_binding', { p_restaurant_id: restaurantId, p_source_id: 'sofa',
    p_action: action, p_revision: revision, p_expected_name: token, p_expected_address: 'Reviewed branch',
    p_evidence: 'Fixture operator explicitly checked source and exact branch.', p_confirmed: action === 'confirm', ...patch });
}
describe('import publication atomic linkage and RLS', () => {
  it('atomically audits initial confirmation, replacement evidence and disabling by the acting Admin', async () => {
    const initial = await operator.from('admin_audit_log').select('*').eq('record_id', restaurantId)
      .eq('table_name', 'lunch_import_bindings').single();
    expect(initial.error).toBeNull();
    expect(initial.data).toMatchObject({ actor_id: users[0], action: 'insert', before: null,
      after: { source_id: 'sofa', revision: bindingRevision, enabled: true, verified_by: users[0] } });
    const before = initial.data.after;
    const note = 'Second Admin checked the branch with updated source evidence.';
    const verified = await configure('confirm', bindingRevision, secondOperator, { p_evidence: note });
    expect(verified.error).toBeNull(); bindingRevision = verified.data.revision;
    const rows = await operator.from('admin_audit_log').select('*').eq('record_id', restaurantId)
      .eq('table_name', 'lunch_import_bindings').eq('after->>revision', bindingRevision).single();
    expect(rows.data).toMatchObject({ actor_id: users[1], action: 'update', before,
      after: { verification_note: note, verified_by: users[1], enabled: true } });
    const disabled = await configure('disable'); expect(disabled.error).toBeNull();
    const audit = await operator.from('admin_audit_log').select('*').eq('record_id', restaurantId)
      .eq('table_name', 'lunch_import_bindings').eq('after->>revision', disabled.data.revision).single();
    expect(audit.data).toMatchObject({ actor_id: users[0], action: 'update',
      before: { enabled: true, verified_by: users[1] }, after: { enabled: false, verified_by: users[1] } });
    const rejected = await configure('confirm', bindingRevision);
    expect(rejected.error).not.toBeNull();
    const history = await operator.from('admin_audit_log').select('id').eq('record_id', restaurantId)
      .eq('table_name', 'lunch_import_bindings');
    expect(history.data).toHaveLength(3);
    const hidden = await regular.from('admin_audit_log').select('id').eq('record_id', restaurantId);
    expect(hidden.data).toEqual([]);
    for (const method of ['update', 'delete'] as const) {
      const query = method === 'update' ? operator.from('admin_audit_log').update({ after: null })
        : operator.from('admin_audit_log').delete();
      const denied = await query.eq('id', initial.data.id).select('id');
      expect(denied.error).toBeNull(); expect(denied.data).toEqual([]);
    }
    const restored = await configure('confirm', disabled.data.revision);
    expect(restored.error).toBeNull(); bindingRevision = restored.data.revision;
  });
  it('uses identical conservative normalization in application and database', async () => {
    for (const value of ['  Al. Paderewskiego 35, Wrocław ', 'ULICA Marco Polo 9e Wrocław',
      'żul. Nie jest prefiksem', 'Ａｌ. Paderewskiego 35', 'ul. Marco Pollo 9e']) {
      const response = await operator.rpc('normalize_import_identity', { value });
      expect(response.error).toBeNull(); expect(response.data).toBe(normalizeImportIdentity(value));
    }
  });
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
  it('requires Admin independently and hides bindings through RLS; enforces FK and evidence', async () => {
    expect((await configure('confirm', bindingRevision, regular)).error?.code).toBe('42501');
    const hidden = await regular.from('lunch_import_bindings').select('*');
    expect(hidden.error).toBeNull(); expect(hidden.data).toEqual([]);
    const denied = await regular.from('lunch_import_bindings').update({ enabled: false }).eq('source_id', 'sofa').select();
    expect(denied.error).toBeNull(); expect(denied.data).toEqual([]);
    for (const patch of [{ p_confirmed: false }, { p_evidence: '' }, { p_expected_address: 'Unreviewed branch' },
      { p_restaurant_id: '1070afce-ff35-4861-b940-f4eb783b9e40' }]) {
      expect((await configure('confirm', bindingRevision, operator, patch)).error).not.toBeNull();
    }
    const invalidFk = await admin.from('lunch_import_bindings').insert({ source_id: 'sushi',
      restaurant_id: randomUUID(), enabled: false,
      verified_name: 'Missing', verified_address: 'Missing', source_url: 'https://sushifriendswroclaw.pl/',
      source_name: 'Sushi Friends Bar & Resto', source_address: 'Reviewed branch', verification_note: 'Reviewed fixture' });
    expect(invalidFk.error?.code).toBe('23503');
  });
  it('records server-authoritative verification and rejects concurrent stale confirmations', async () => {
    const result = await operator.from('lunch_import_bindings').select('*').eq('source_id', 'sofa').single();
    expect(result.data).toMatchObject({ restaurant_id: restaurantId, verified_by: users[0],
      verified_name: token, verified_address: 'Reviewed branch', enabled: true });
    expect(result.data.verified_at).toBeTruthy();
    const old = bindingRevision;
    const responses = await Promise.all([configure('confirm', old), configure('confirm', old, secondOperator)]);
    expect(responses.filter(response => !response.error)).toHaveLength(1);
    bindingRevision = responses.find(response => !response.error)!.data.revision;
    expect((await operator.rpc('create_lunch_import_offer', { ...request('1'), p_binding_revision: old })).error).not.toBeNull();
  });
  it('blocks both new publication and existing-item retries after disable/re-enable', async () => {
    const old = bindingRevision;
    const disabled = await configure('disable'); expect(disabled.error).toBeNull();
    expect((await operator.rpc('create_lunch_import_offer', request('a'))).error).not.toBeNull();
    expect((await operator.rpc('create_lunch_import_offer', request('2'))).error).not.toBeNull();
    const reenabled = await configure('confirm', disabled.data.revision); expect(reenabled.error).toBeNull();
    bindingRevision = reenabled.data.revision;
    expect((await operator.rpc('create_lunch_import_offer', { ...request('a'), p_binding_revision: old })).error).not.toBeNull();
    const current = await operator.rpc('create_lunch_import_offer', request('a'));
    expect(current.error).toBeNull(); expect(current.data.offer.price).toBe(29);
  });
  it('retains formatting-equivalent edits but invalidates material edits even when reverted', async () => {
    const formatting = await operator.from('restaurants').update({ address: '  REVIEWED   BRANCH ' }).eq('id', restaurantId);
    expect(formatting.error).toBeNull();
    const equivalent = await operator.rpc('create_lunch_import_offer', { ...request('3'), p_expected_address: '  REVIEWED   BRANCH ' });
    expect(equivalent.error).toBeNull();
    await operator.from('restaurants').update({ address: 'Reviewed branch' }).eq('id', restaurantId);
    const changed = await operator.from('restaurants').update({ address: 'Other branch' }).eq('id', restaurantId);
    expect(changed.error).toBeNull();
    await operator.from('restaurants').update({ address: 'Reviewed branch' }).eq('id', restaurantId);
    expect((await operator.rpc('create_lunch_import_offer', request('4'))).error).not.toBeNull();
    const binding = await operator.from('lunch_import_bindings').select('*').eq('source_id', 'sofa').single();
    expect(binding.data.enabled).toBe(false); expect(binding.data.restaurant_id).toBe(restaurantId);
    const reverified = await configure('confirm', binding.data.revision); expect(reverified.error).toBeNull();
    bindingRevision = reverified.data.revision;
  });
  it('does not transfer a verified fixed source silently to another Restaurant', async () => {
    const other = await admin.from('restaurants').insert({ name: `${token}-other`, address: 'Other branch', user_id: users[2] }).select('id').single();
    if (other.error) throw other.error;
    try {
      const rejected = await configure('confirm', bindingRevision, operator, { p_restaurant_id: other.data.id,
        p_expected_name: `${token}-other`, p_expected_address: 'Other branch' });
      expect(rejected.error).not.toBeNull();
      await admin.from('restaurants').update({ address: 'Typo explained by operator' }).eq('id', other.data.id);
      const verified = await operator.rpc('configure_lunch_import_binding', { p_restaurant_id: other.data.id, p_source_id: 'sushi',
        p_action: 'confirm', p_revision: null, p_expected_name: `${token}-other`, p_expected_address: 'Typo explained by operator',
        p_evidence: 'Operator checked exact branch on official website and explained typo.', p_confirmed: true });
      expect(verified.error).toBeNull(); expect(verified.data.verified_address).toBe('Typo explained by operator');
      const ownerEdit = await regular.from('restaurants').update({ address: 'Changed by ordinary owner' }).eq('id', other.data.id);
      expect(ownerEdit.error).toBeNull();
      const invalidated = await operator.from('lunch_import_bindings').select('enabled,restaurant_id').eq('source_id', 'sushi').single();
      expect(invalidated.data).toMatchObject({ enabled: false, restaurant_id: other.data.id });
    } finally {
      await admin.from('restaurants').delete().eq('id', other.data.id);
      await admin.from('admin_audit_log').delete().eq('record_id', other.data.id).eq('table_name', 'lunch_import_bindings');
    }
    const removed = await operator.from('lunch_import_bindings').select('*').eq('source_id', 'sushi');
    expect(removed.data).toEqual([]);
  });
  it('audits direct Admin writes and retains binding history after Restaurant deletion', async () => {
    const seeded = await admin.from('restaurants').insert({ name: token, address: 'Reviewed branch', user_id: users[0] }).select('id').single();
    if (seeded.error) throw seeded.error;
    const id = seeded.data.id;
    try {
      const verified = await configure('confirm', null, operator, { p_restaurant_id: id, p_source_id: 'sushi' });
      expect(verified.error).toBeNull();
      const direct = await secondOperator.from('lunch_import_bindings').update({ enabled: false }).eq('source_id', 'sushi');
      expect(direct.error).toBeNull();
      const deleted = await operator.from('restaurants').delete().eq('id', id);
      expect(deleted.error).toBeNull();
      const history = await operator.from('admin_audit_log').select('*').eq('record_id', id)
        .eq('table_name', 'lunch_import_bindings').order('created_at');
      expect(history.error).toBeNull(); expect(history.data).toHaveLength(3);
      expect(history.data?.[1]).toMatchObject({ actor_id: users[1], action: 'update',
        before: { enabled: true }, after: { enabled: false, source_id: 'sushi' } });
      expect(history.data?.[2]).toMatchObject({ actor_id: users[0], action: 'delete',
        before: { enabled: false, source_id: 'sushi' }, after: null });
    } finally {
      await admin.from('restaurants').delete().eq('id', id);
      await admin.from('admin_audit_log').delete().eq('record_id', id).eq('table_name', 'lunch_import_bindings');
    }
  });
  it('allows deletion of the verifying account while disabling its binding', async () => {
    const verifier = await signInIdentity(token, ADMIN_CLAIM);
    users.push(verifier.id);
    const verified = await configure('confirm', bindingRevision, verifier.client);
    expect(verified.error).toBeNull();
    const deleted = await admin.auth.admin.deleteUser(verifier.id);
    expect(deleted.error).toBeNull();
    const history = await operator.from('admin_audit_log').select('*').eq('record_id', restaurantId)
      .eq('table_name', 'lunch_import_bindings').eq('after->>revision', verified.data.revision).single();
    expect(history.error).toBeNull();
    expect(history.data).toMatchObject({ actor_id: null, after: { verified_by: verifier.id } });
    const result = await operator.from('lunch_import_bindings').select('*').eq('source_id', 'sofa').single();
    expect(result.data).toMatchObject({ enabled: false, verified_by: null, restaurant_id: restaurantId });
    expect((await operator.rpc('create_lunch_import_offer', { ...request('5'), p_binding_revision: verified.data.revision })).error).not.toBeNull();
    const restored = await configure('confirm', result.data.revision);
    expect(restored.error).toBeNull(); bindingRevision = restored.data.revision;
  });
});
