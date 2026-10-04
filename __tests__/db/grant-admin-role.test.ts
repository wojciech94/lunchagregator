/**
 * Does granting the admin role actually work, end to end?
 *
 * The question behind #56: an operator sets app_metadata.role on a real account,
 * and then what? Does the role take effect immediately, on the next sign-in, or
 * only after the token expires?
 *
 * The answer decides whether #56's procedure can say "grant and it works" or has
 * to say "grant, then have them sign in again". Guessing here is how an operator
 * ends up believing the role is broken.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { adminClient, runToken, todayUtc } from './helpers';

const admin = adminClient();
const token = runToken('grant-role');

const email = `${token}@example.test`;
const password = 'Password123!';

let userId: string | undefined;

/** A signed-in client plus the claims its token actually carries. */
async function signedIn() {
  const client = createClient(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn: ${error.message}`);

  const claims = JSON.parse(
    Buffer.from(data.session!.access_token.split('.')[1], 'base64url').toString('utf8'),
  );
  const { data: isAdmin } = await client.rpc('is_admin');
  return { client, claims, isAdmin, expiresAt: data.session!.expires_at };
}

/** Seed an offer that only an admin could touch. */
async function seedOrphan(dish: string): Promise<string> {
  const { data, error } = await admin
    .from('lunch_offers')
    .insert({
      dish_name: dish,
      price: 20,
      restaurant_name: 'probe restaurant',
      available_date: todayUtc(),
      source_type: 'text',
      session_token: token,
      items: [],
      dietary_tags: [],
      allergens: [],
      user_id: null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed failed: ${error.message}`);
  return data.id;
}

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from('lunch_offers').delete().eq('session_token', token);
});

describe('granting the admin role to an existing account', () => {
  it('changes what the database accepts, and says when', async () => {
    // Created with no role at all, like every account made through the app.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError) throw new Error(`createUser: ${createError.message}`);
    userId = created.user.id;

    const before = await signedIn();
    expect(before.claims.app_metadata).not.toMatchObject({ role: 'admin' });
    expect(before.isAdmin).toBe(false);

    // The orphan row this account cannot touch yet.
    const orphanId = await seedOrphan('before');
    const attempted = await before.client
      .from('lunch_offers')
      .update({ dish_name: 'attempted' })
      .eq('id', orphanId)
      .select();
    expect(attempted.data ?? []).toHaveLength(0);

    // This is the operation #56 documents: the service-role key, an existing
    // user id, and the claim contents -- not the claim wrapped in its own name.
    const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(
      userId,
      { app_metadata: { role: 'admin' } },
    );
    expect(updateError).toBeNull();
    expect(updated.user.app_metadata).toMatchObject({ role: 'admin' });

    // The old session's token still carries no role, so the change is NOT live
    // for a session that already exists. This is the operational detail #56 has
    // to state, and it is why the assertion below checks a *fresh* sign-in.
    const { data: stale, error: staleError } = await before.client.rpc('is_admin');
    expect(staleError).toBeNull();
    console.log('stale session is_admin =', stale);
    expect(stale).toBe(false);

    // A fresh sign-in picks it up.
    const after = await signedIn();
    console.log('fresh session is_admin =', after.isAdmin);
    expect(after.isAdmin).toBe(true);
    expect(after.claims.app_metadata).toMatchObject({ role: 'admin' });

    // And the action that was refused now succeeds.
    const allowed = await after.client
      .from('lunch_offers')
      .update({ dish_name: 'granted' })
      .eq('id', orphanId)
      .select();
    expect(allowed.error).toBeNull();
    expect(allowed.data).toHaveLength(1);
  });
});

describe('revoking the role', () => {
  it('takes effect on the next sign-in', async () => {
    if (!userId) throw new Error('no user to revoke');

    // Passing an empty object clears it, rather than leaving the claim as it was.
    const { error } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { role: 'admin' },
    });
    expect(error).toBeNull();

    // There is no documented "unset" -- the claim is replaced, so a non-admin
    // value is the way to take the privilege away.
    const { error: demoteError } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { role: 'user' },
    });
    expect(demoteError).toBeNull();

    const revoked = await signedIn();
    expect(revoked.isAdmin).toBe(false);
  });
});