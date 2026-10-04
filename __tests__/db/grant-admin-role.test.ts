/**
 * Granting the admin role, executed against the real database. #56.
 *
 * The procedure this documents is three lines long, and two of its failure
 * modes report success while leaving nobody an admin. That is why it is a test
 * rather than a paragraph: a description of a procedure that has never run is a
 * guess with a code fence around it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { adminClient } from './helpers';
import { runToken } from './helpers';

const admin = adminClient();

interface CreatedUser {
  id: string;
  email: string;
}

const created: string[] = [];

async function makeUser(): Promise<CreatedUser> {
  const email = `${runToken('grant')}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'Grant-Role-Test-1234',
    email_confirm: true,
  });

  if (error) throw new Error(`createUser failed: ${error.message}`);
  created.push(data.user.id);
  return { id: data.user.id, email };
}

/**
 * Whether this user carries the claim an admin would get.
 *
 * Reading `app_metadata` is the whole point rather than a shortcut: it is
 * exactly what GoTrue signs into the JWT, and `is_admin()` reads exactly that
 * claim. A procedure that stores the role anywhere else would leave this false,
 * which is the failure the nesting test below is about.
 */
async function hasAdminClaim(userId: string): Promise<boolean> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) throw new Error(error.message);
  return (data.user.app_metadata as { role?: unknown } | undefined)?.role === 'admin';
}

afterEach(async () => {
  for (const id of created.splice(0)) {
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }
});

describe('granting the admin role', () => {
  it('starts with nobody holding it', async () => {
    const user = await makeUser();

    expect(await hasAdminClaim(user.id)).toBe(false);
  });

  it('makes an admin out of a plain account', async () => {
    const user = await makeUser();

    const { error } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { role: 'admin' },
    });

    expect(error).toBeNull();
    expect(await hasAdminClaim(user.id)).toBe(true);
  });

  it('does NOT make an admin when the claim is wrapped in its own name', async () => {
    // The mistake that reads as success. `updateUserById` takes the claim's
    // *contents*, so passing `{ app_metadata: { role: 'admin' } }` is accepted
    // without error, stores the nesting, and leaves the role out of the JWT.
    // Nothing fails. The operator believes it worked and nobody can act.
    const user = await makeUser();

    const { error } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { app_metadata: { role: 'admin' } },
    } as never);

    expect(error).toBeNull();
    expect(await hasAdminClaim(user.id)).toBe(false);
  });

  it('does NOT revoke the role when the claim is set to an empty object', async () => {
    // Also reads as success. `updateUserById` merges rather than replaces, so
    // `{}` leaves the existing key in place and the privilege survives a
    // revocation that someone believes they performed.
    const user = await makeUser();

    await admin.auth.admin.updateUserById(user.id, { app_metadata: { role: 'admin' } });
    expect(await hasAdminClaim(user.id)).toBe(true);

    const { error } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: {},
    });

    expect(error).toBeNull();
    expect(await hasAdminClaim(user.id)).toBe(true);
  });

  it('revokes with any non-admin value, because the claim is replaced', async () => {
    // There is no "unset". This is the shape that actually takes the privilege
    // away, and the reason the empty-object case above is a trap.
    const user = await makeUser();

    await admin.auth.admin.updateUserById(user.id, { app_metadata: { role: 'admin' } });
    expect(await hasAdminClaim(user.id)).toBe(true);

    await admin.auth.admin.updateUserById(user.id, { app_metadata: { role: 'user' } });

    expect(await hasAdminClaim(user.id)).toBe(false);
  });

  it('refuses the anon key outright', async () => {
    // The service-role key is not a nicety: the anon key cannot write
    // `app_metadata` at all, so this is the difference between granting the
    // role and silently not.
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(
      process.env.TEST_SUPABASE_URL!,
      process.env.TEST_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const user = await makeUser();

    const { error } = await anon.auth.admin.updateUserById(user.id, {
      app_metadata: { role: 'admin' },
    });

    expect(error).not.toBeNull();
    expect(await hasAdminClaim(user.id)).toBe(false);
  });
});
