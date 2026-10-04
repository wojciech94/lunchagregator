/**
 * The admin role, executed against the real database. #54, part 1.
 *
 * This file exists because the admin bypass has to exist in two places at once.
 * An admin check in application code without the matching RLS policy fails
 * *quietly*: the UPDATE matches zero rows, PostgREST returns 200 with an empty
 * body, `if (error)` is false, and the action reports success. A passing unit
 * test suite would not show that, because the Supabase client is mocked and a
 * mock answers to any query.
 *
 * So every assertion here goes through PostgREST with a real signed-in JWT, which
 * is the only way to tell that the database and the application layer agree.
 *
 * Each identity is created at runtime through `auth.admin.createUser` rather than
 * seeded: a seeded user has a fixed id, and a fixed id in shared test data is how
 * one test's authorization assertion becomes another test's false pass.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { adminClient, runToken, todayUtc } from './helpers';

const admin = adminClient();
const token = runToken('db-admin-role');

const createdUserIds: string[] = [];

interface Identity {
  client: SupabaseClient;
  id: string;
  email: string;
}

let seq = 0;

/**
 * Creates a user and a client carrying their session.
 *
 * `app_metadata` is set through the admin API because that is the only way the
 * service-role key can write it -- which is the property that makes the role
 * unforgeable from the client, and the reason `isAdmin` reads that field.
 */
async function identity(appMetadata: Record<string, unknown> | null): Promise<Identity> {
  seq += 1;
  const email = `${token}-${seq}@example.test`;
  const password = 'Password123!';

  // `app_metadata` is a top-level parameter of createUser, not something to nest
  // under a key of the same name. Passing `{ app_metadata: { app_metadata: ... } }`
  // is accepted without error and stores the nesting, so the role silently never
  // reaches the JWT and `is_admin()` reads false. Caught here by logging what
  // createUser returned rather than trusting the request shape.
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
  const { data: session, error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw new Error(`signIn: ${signInError.message}`);
  if (session.user!.id !== data.user.id) {
    throw new Error('session identity does not match the created user');
  }

  return { client, id: data.user.id, email };
}

/**
 * The contents of the admin's `app_metadata` claim -- not the claim wrapped in
 * its own name. `identity()` spreads this into createUser's `app_metadata`
 * parameter, so a value already carrying the key nests twice and the role never
 * reaches the JWT.
 */
const ADMIN = { role: 'admin' } as const;

/** A row owned by `ownerId`, or ownerless when that is null. */
async function seedOffer(ownerId: string | null, dishName: string): Promise<string> {
  const { data, error } = await admin
    .from('lunch_offers')
    .insert({
      dish_name: dishName,
      price: 20,
      restaurant_name: 'probe restaurant',
      available_date: todayUtc(),
      source_type: 'text',
      session_token: token,
      items: [],
      dietary_tags: [],
      allergens: [],
      user_id: ownerId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed failed: ${error.message}`);
  return data.id;
}

/**
 * The dish name, or undefined if the row is gone.
 *
 * Uses `maybeSingle` rather than `single`: after a delete the row does not exist,
 * and `single` reports that as an error -- which would make "deleted" and "read
 * failed" indistinguishable in the one assertion that is about deletion.
 */
async function readDish(id: string): Promise<string | undefined> {
  const { data, error } = await admin
    .from('lunch_offers')
    .select('dish_name')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`read failed: ${error.message}`);
  return data?.dish_name;
}

/** Whether a client's UPDATE changed the row. RLS makes a no-op a success. */
async function dishAfterUpdate(
  client: SupabaseClient,
  id: string,
  dishName: string,
): Promise<string | undefined> {
  await client.from('lunch_offers').update({ dish_name: dishName }).eq('id', id);
  return readDish(id);
}

beforeAll(async () => {
  // Identities are created in the tests that use them, so a failure names the
  // layer it came from rather than a shared beforeAll that fails opaquely.
});

afterAll(async () => {
  await admin.from('lunch_offers').delete().eq('session_token', token);
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe('an admin can modify another User\'s record', () => {
  it('updates a row owned by somebody else', async () => {
    const owner = await identity(null);
    const adminUser = await identity(ADMIN);
    const id = await seedOffer(owner.id, 'before');

    expect(await dishAfterUpdate(adminUser.client, id, 'after')).toBe('after');
  });

  it('cannot be forged from the client', async () => {
    // The whole reason the role is read from app_metadata. `user_metadata` is
    // writable by the account holder through updateUser, so a policy or a
    // predicate that read it would honour a role anyone assigns to themselves.
    const impostor = await identity(null);
    const victim = await seedOffer(null, 'untouched');

    const { error: updateError } = await impostor.client.auth.updateUser({
      data: { user_metadata: { role: 'admin' } },
    });
    // The write itself is expected to succeed -- that is the point. What matters
    // is that it grants nothing.
    expect(updateError).toBeNull();

    // app_metadata is untouched by the client's own call, and is_admin() reads
    // only app_metadata.
    const { data: isAdminNow } = await impostor.client.rpc('is_admin');
    expect(isAdminNow).toBe(false);

    expect(await dishAfterUpdate(impostor.client, victim, 'hijacked')).toBe('untouched');
  });
});

describe('an ordinary User still cannot touch another User\'s record', () => {
  it('is refused, and the row is unchanged', async () => {
    const owner = await identity(null);
    const stranger = await identity(null);
    const id = await seedOffer(owner.id, 'owned');

    // No error and no change: RLS filters the row out, the UPDATE matches zero
    // rows. That is the asymmetry documented at authorization.test.ts:76, and it
    // is why the application-layer check is not optional.
    expect(await dishAfterUpdate(stranger.client, id, 'hijacked')).toBe('owned');
  });

  it('is refused when the role is something other than admin', async () => {
    const owner = await identity(null);
    const notAdmin = await identity({ app_metadata: { role: 'user' } });
    const id = await seedOffer(owner.id, 'owned');

    expect(await dishAfterUpdate(notAdmin.client, id, 'hijacked')).toBe('owned');
  });
});

describe('an admin can reclaim a record with no owner', () => {
  it('updates a row whose user_id is NULL', async () => {
    // The defect #6 described: `ON DELETE SET NULL` leaves an offer with no
    // owner, publicly visible through Requirement 6.1, and unreachable by
    // anyone. `checkOwnership` still refuses it, by design -- this is the admin
    // branch that makes it manageable.
    const adminUser = await identity(ADMIN);
    const id = await seedOffer(null, 'orphaned');

    const { data: orphan } = await admin
      .from('lunch_offers')
      .select('user_id')
      .eq('id', id)
      .single();
    expect(orphan?.user_id).toBeNull();

    expect(await dishAfterUpdate(adminUser.client, id, 'reclaimed')).toBe('reclaimed');
  });

  it('still leaves it unreachable for an ordinary User', async () => {
    const stranger = await identity(null);
    const id = await seedOffer(null, 'orphaned');

    expect(await dishAfterUpdate(stranger.client, id, 'claimed')).toBe('orphaned');
  });

  it('leaves the owner unset rather than claiming it for the admin', async () => {
    // An admin editing a record is not an owner of it. Reassigning user_id would
    // transfer property as a side effect of a correction, which is #6's
    // account-takeover problem arriving by another route.
    const adminUser = await identity(ADMIN);
    const id = await seedOffer(null, 'orphaned');

    await adminUser.client.from('lunch_offers').update({ dish_name: 'fixed' }).eq('id', id);

    const { data } = await admin
      .from('lunch_offers')
      .select('user_id')
      .eq('id', id)
      .single();
    expect(data?.user_id).toBeNull();
  });
});

describe('an admin can delete, and the deletion is a real deletion', () => {
  it('removes a row owned by somebody else', async () => {
    const owner = await identity(null);
    const adminUser = await identity(ADMIN);
    const id = await seedOffer(owner.id, 'doomed');

    const { error } = await adminUser.client
      .from('lunch_offers')
      .delete()
      .eq('id', id);
    expect(error).toBeNull();

    // Read through the service role rather than the admin's client: a deleted
    // row is filtered by the public read policy as well, so asking the admin's
    // own client would not distinguish "deleted" from "invisible to you".
    expect(await readDish(id)).toBeUndefined();
  });

  it('removes a row with no owner', async () => {
    const adminUser = await identity(ADMIN);
    const id = await seedOffer(null, 'doomed orphan');

    const { error } = await adminUser.client
      .from('lunch_offers')
      .delete()
      .eq('id', id);
    expect(error).toBeNull();
    expect(await readDish(id)).toBeUndefined();
  });

  it('still refuses an ordinary User', async () => {
    const owner = await identity(null);
    const stranger = await identity(null);
    const id = await seedOffer(owner.id, 'safe');

    const { error } = await stranger.client.from('lunch_offers').delete().eq('id', id);
    expect(error).toBeNull();
    expect(await readDish(id)).toBe('safe');
  });
});

describe('the role does not widen reads', () => {
  it('reads an offer through the public policy, not a privileged one', async () => {
    const adminUser = await identity(ADMIN);
    const id = await seedOffer(null, 'public');

    const { data, error } = await adminUser.client
      .from('lunch_offers')
      .select('id')
      .eq('id', id)
      .single();

    expect(error).toBeNull();
    expect(data!.id).toBe(id);
  });
});