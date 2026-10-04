/**
 * `admin_audit_log`, executed against the real database. #54, part 2.
 *
 * The property that matters here is not "a log row is written" -- it is that the
 * row **cannot be removed or altered**. An append-only log that an admin can
 * rewrite is not an audit trail, so that is asserted directly: an admin is given
 * a session and then told UPDATE and DELETE both do nothing.
 *
 * Part 1's file covers the permission itself. This one covers the record of it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { adminClient, runToken } from './helpers';

const admin = adminClient();
const token = runToken('db-audit');

let createdUserIds: string[] = [];

interface Identity {
  client: SupabaseClient;
  id: string;
}

let seq = 0;

/**
 * A user, and a client carrying their session.
 *
 * `app_metadata` is a top-level parameter of createUser, not something to nest
 * under a key of the same name: passing `{ app_metadata: { app_metadata: ... } }`
 * is accepted without error, stores the nesting, and leaves the role absent from
 * the JWT. That mistake was made once already while writing this feature.
 */
async function identity(appMetadata: Record<string, unknown> | null): Promise<Identity> {
  seq += 1;
  const email = `${token}-${seq}@example.test`;
  const password = 'Password123!';

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    ...(appMetadata ? { app_metadata: appMetadata } : {}),
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  createdUserIds.push(data.user.id);

  const client = createClient(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn: ${signInError.message}`);

  return { client, id: data.user.id };
}

const ADMIN = { role: 'admin' };

interface LogRow {
  actor_id: string | null;
  action: string;
  table_name: string;
  record_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

/**
 * Log rows for a record, read through the service role.
 *
 * Filtered by `record_id` -- the id of the *offer or restaurant* the row describes.
 * Not to be confused with the log row's own `id`; use `logRowById` for that. Passing
 * one to the other returns nothing rather than erroring, which is how this was
 * wrong for a while.
 */
async function logRows(recordId: string): Promise<LogRow[]> {
  const { data, error } = await admin
    .from('admin_audit_log')
    .select('*')
    .eq('record_id', recordId);
  if (error) throw new Error(`log read failed: ${error.message}`);
  return (data ?? []) as LogRow[];
}

/** One log row by its own id. */
async function logRowById(id: string): Promise<LogRow[]> {
  const { data, error } = await admin
    .from('admin_audit_log')
    .select('*')
    .eq('id', id);
  if (error) throw new Error(`log read failed: ${error.message}`);
  return (data ?? []) as LogRow[];
}

beforeAll(async () => {
  // Nothing seeded: every row here is written by a test, and the counts are
  // asserted per record_id so one test's rows cannot satisfy another's assertion.
});

afterAll(async () => {
  // Deleted by actor, which is unique per run: the table has no `session_token`
  // column to key on, and a prefix match on record_id would be both wrong and
  // unable to catch the fixed probe ids the append-only cases use. Every row this
  // file writes is attributed to an identity it created, so that is the scope.
  for (const id of createdUserIds) {
    await admin.from('admin_audit_log').delete().eq('actor_id', id);
  }
  await admin.from('lunch_offers').delete().eq('session_token', token);
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe('the log records an admin action', () => {
  it('captures actor, action, table, record, and the row as it was', async () => {
    const actor = await identity(ADMIN);
    const owner = await identity(null);

    const { data: offer, error: seedError } = await admin
      .from('lunch_offers')
      .insert({
        dish_name: 'before',
        price: 20,
        restaurant_name: 'probe restaurant',
        available_date: new Date().toISOString().slice(0, 10),
        source_type: 'text',
        session_token: token,
        items: [],
        dietary_tags: [],
        allergens: [],
        user_id: owner.id,
      })
      .select('id')
      .single();
    if (seedError) throw new Error(`seed failed: ${seedError.message}`);

    // The mutation, then the log entry, as the action layer does them.
    await actor.client
      .from('lunch_offers')
      .update({ dish_name: 'after' })
      .eq('id', offer.id);
    await actor.client.from('admin_audit_log').insert({
      actor_id: actor.id,
      action: 'update',
      table_name: 'lunch_offers',
      record_id: offer.id,
      before: { dish_name: 'before' },
      after: { dish_name: 'after' },
    });

    const rows = await logRows(offer.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_id: actor.id,
      action: 'update',
      table_name: 'lunch_offers',
      record_id: offer.id,
      before: { dish_name: 'before' },
      after: { dish_name: 'after' },
    });

    await admin.from('lunch_offers').delete().eq('id', offer.id);
  });

  it('keeps the deleted record readable after the row is gone', async () => {
    // The reason the table exists rather than a column. This asserts the thing
    // that makes it worth a migration: subject deleted, record surviving.
    const actor = await identity(ADMIN);

    const { data: offer } = await admin
      .from('lunch_offers')
      .insert({
        dish_name: 'doomed',
        price: 20,
        restaurant_name: 'probe restaurant',
        available_date: new Date().toISOString().slice(0, 10),
        source_type: 'text',
        session_token: token,
        items: [],
        dietary_tags: [],
        allergens: [],
        user_id: null,
      })
      .select('id')
      .single();

    await actor.client.from('lunch_offers').delete().eq('id', offer!.id);
    await actor.client.from('admin_audit_log').insert({
      actor_id: actor.id,
      action: 'delete',
      table_name: 'lunch_offers',
      record_id: offer!.id,
      before: { dish_name: 'doomed', price: 20 },
      after: null,
    });

    const { data: gone } = await admin
      .from('lunch_offers')
      .select('id')
      .eq('id', offer!.id)
      .maybeSingle();
    expect(gone).toBeNull();

    const rows = await logRows(offer!.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('delete');
    expect(rows[0].before).toMatchObject({ dish_name: 'doomed' });
  });
});

describe('the log is append-only, for an admin as much as anyone', () => {
  it('ignores an UPDATE from an admin', async () => {
    // With RLS enabled and no UPDATE policy, the row is filtered out and the
    // UPDATE matches zero rows -- no error, no change. That asymmetry with
    // DELETE is deliberate and documented: a log that can be edited proves
    // nothing.
    const actor = await identity(ADMIN);

    const { data: row } = await admin
      .from('admin_audit_log')
      .insert({
        actor_id: actor.id,
        action: 'update',
        table_name: 'lunch_offers',
        record_id: '00000000-0000-4000-8000-0000000000aa',
        before: null,
        after: null,
      })
      .select('id, action')
      .single();

    const before1 = await logRowById(row!.id);
    expect(before1).toHaveLength(1);

    const { data: updateData } = await actor.client
      .from('admin_audit_log')
      .update({ action: 'delete' })
      .eq('id', row!.id)
      .select();

    // Asserted on the data, not on `error`. RLS filters the row out, so the
    // UPDATE matches zero rows and returns no error at all -- verified, not
    // assumed: err=none, rows=undefined. An assertion that only checked `error`
    // would pass just as well against a policy that did nothing, which is the
    // failure mode authorization.test.ts calls out for anonymous callers.
    expect(updateData ?? []).toHaveLength(0);

    const rows = await logRowById(row!.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('update');
  });

  it('ignores a DELETE from an admin', async () => {
    const actor = await identity(ADMIN);

    const { data: row } = await admin
      .from('admin_audit_log')
      .insert({
        actor_id: actor.id,
        action: 'delete',
        table_name: 'lunch_offers',
        record_id: '00000000-0000-4000-8000-0000000000ab',
        before: null,
        after: null,
      })
      .select('id')
      .single();

    const { data: deleteData } = await actor.client
      .from('admin_audit_log')
      .delete()
      .eq('id', row!.id);

    // DELETE returns no row count, so the only way to observe the refusal is to
    // read the row back through the service role and find it still there.
    void deleteData;
    const rows = await logRowById(row!.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('delete');
  });

  it('ignores a DELETE from an ordinary User too', async () => {
    const stranger = await identity(null);
    const { data: row } = await admin
      .from('admin_audit_log')
      .insert({
        actor_id: stranger.id,
        action: 'update',
        table_name: 'restaurants',
        record_id: '00000000-0000-4000-8000-0000000000ac',
        before: null,
        after: null,
      })
      .select('id')
      .single();

    await stranger.client.from('admin_audit_log').delete().eq('id', row!.id);

    const rows = await logRowById(row!.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('update');
  });
});

describe('the log is not readable by the public', () => {
  it('refuses an anonymous read', async () => {
    const { createClient: makeClient } = await import('@supabase/supabase-js');
    const anon = makeClient(
      process.env.TEST_SUPABASE_URL!,
      process.env.TEST_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data, error } = await anon.from('admin_audit_log').select('id').limit(1);

    // Either shape is acceptable: an error, or an empty result through RLS. What
    // must not happen is a row. The log is a map of who operates this service.
    expect(error?.message ?? '').toBeTypeOf('string');
    expect(data ?? []).toHaveLength(0);
  });

  it('refuses an ordinary User', async () => {
    // Same asymmetry as the mutations: with a SELECT policy that does not match,
    // RLS returns an empty set rather than an error. The assertion that matters
    // is that no rows come back.
    const stranger = await identity(null);

    const { data } = await stranger.client.from('admin_audit_log').select('id').limit(1);

    expect(data ?? []).toHaveLength(0);
  });

  it('lets an admin read it', async () => {
    const actor = await identity(ADMIN);

    const { error } = await actor.client.from('admin_audit_log').select('id').limit(1);

    expect(error).toBeNull();
  });
});

describe('the log rejects what it should', () => {
  it('refuses an unknown action', async () => {
    const actor = await identity(ADMIN);

    const { error } = await actor.client.from('admin_audit_log').insert({
      actor_id: actor.id,
      action: 'obliterate',
      table_name: 'lunch_offers',
      record_id: '00000000-0000-4000-8000-0000000000ad',
    });

    expect(error).not.toBeNull();
  });

  it('refuses an unknown table', async () => {
    const actor = await identity(ADMIN);

    const { error } = await actor.client.from('admin_audit_log').insert({
      actor_id: actor.id,
      action: 'update',
      table_name: 'secrets',
      record_id: '00000000-0000-4000-8000-0000000000ae',
    });

    expect(error).not.toBeNull();
  });
});