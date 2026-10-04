/**
 * `getAdmin`, against the real `@/lib/auth`. #55.
 *
 * Kept apart from `admin-orphan-offers.test.ts` because that file mocks
 * `@/lib/auth` in order to control the action's guard -- and a test that mocks
 * the module under discussion can only assert that the mock exists. This one
 * runs the real composition: `getUser()`'s answer, handed to `isAdmin`.
 *
 * The claim shapes below are the ones that decide whether a person is an admin,
 * so they are spelled out rather than generated. `app_metadata` versus
 * `user_metadata` is the whole security property: the first is writable only with
 * the service role and is signed into the JWT, the second is writable by the
 * account holder through `supabase.auth.updateUser`, so a check reading it would
 * honour a role anyone assigns to themselves.
 */
import { describe, expect, it } from 'vitest';

import { mockSupabaseAuth } from '../../../tests/setup';
import { getAdmin, getUser } from '@/lib/auth';

const ID = '11111111-1111-1111-1111-111111111111';

/** Makes `auth.getUser()` answer with this user, or with none. */
function signedInAs(user: Record<string, unknown> | null): void {
  mockSupabaseAuth.getUser.mockResolvedValue({ data: { user }, error: null });
}

describe('getAdmin', () => {
  it('returns the user when app_metadata carries the admin role', async () => {
    signedInAs({ id: ID, app_metadata: { role: 'admin' } });

    await expect(getAdmin()).resolves.toMatchObject({ id: ID });
  });

  it('returns the whole user, not a boolean', async () => {
    // The caller usually wants the id next, and getUser() has already paid for
    // the round trip carrying it.
    signedInAs({ id: ID, email: 'admin@example.test', app_metadata: { role: 'admin' } });

    const admin = await getAdmin();

    expect(admin).not.toBeNull();
    expect(admin!.id).toBe(ID);
    expect(admin!.email).toBe('admin@example.test');
  });

  it('returns null for an anonymous caller', async () => {
    signedInAs(null);

    await expect(getAdmin()).resolves.toBeNull();
  });

  it('returns null for a signed-in User with no role', async () => {
    signedInAs({ id: ID, app_metadata: {} });

    await expect(getAdmin()).resolves.toBeNull();
  });

  it.each([
    ['a different role', { role: 'user' }],
    ['a differently cased role', { role: 'Admin' }],
    ['an empty role', { role: '' }],
    ['a non-string role', { role: 1 }],
    ['the role nested one level too deep', { app_metadata: { role: 'admin' } }],
    ['null metadata', null],
  ])('returns null for %s', async (_label, app_metadata) => {
    signedInAs({ id: ID, app_metadata });

    await expect(getAdmin()).resolves.toBeNull();
  });

  it('ignores a role claimed in user_metadata', async () => {
    // The forgery `isAdmin` is built to refuse, asserted here at the seam the
    // panel actually uses rather than only in the predicate's own suite.
    signedInAs({ id: ID, app_metadata: {}, user_metadata: { role: 'admin' } });

    await expect(getAdmin()).resolves.toBeNull();
  });
});

describe('getUser is unchanged by it', () => {
  it('still returns an ordinary User, which the ownership checks depend on', async () => {
    // updateOfferAction and deleteOfferAction call getUser() and pass the whole
    // user to canModify/canDelete. Routing those through getAdmin would quietly
    // stop an owner from editing their own offer.
    signedInAs({ id: ID, app_metadata: {} });

    await expect(getUser()).resolves.toMatchObject({ id: ID });
  });
});
