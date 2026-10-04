// Feature: user-authentication, Property 6: Ownership check correctness
//
// Plus the admin branch added in #54. `checkOwnership` itself is unchanged and
// still has exactly one property -- ownership is identity, nothing else --
// because widening it was rejected: a function named after one question should
// answer one question. `canModify` composes the admin branch around it.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  canDelete,
  canModify,
  checkOwnership,
  isAdmin,
  type Principal,
} from '@/lib/ownership';

/**
 * Validates: Requirements 5.3, 5.4, 5.5
 *
 * Property 6: Ownership check correctness
 * Ownership is granted only to an authenticated user whose ID exactly matches
 * the non-null owner ID recorded on the resource.
 */
describe('Property 6: Ownership check correctness', () => {
  it('returns true if and only if both generated IDs are non-null and equal', () => {
    const userIdOrNullArb = fc.option(fc.uuid(), { nil: null });
    const ownershipPairArb = fc.oneof(
      fc.uuid().map((userId) => [userId, userId] as const),
      fc.tuple(userIdOrNullArb, userIdOrNullArb)
    );

    fc.assert(
      fc.property(ownershipPairArb, ([requestingUserId, recordUserId]) => {
        expect(checkOwnership(requestingUserId, recordUserId)).toBe(
          requestingUserId !== null && recordUserId !== null && requestingUserId === recordUserId
        );
      }),
      { numRuns: 100 }
    );
  });
});

/** A principal with a role, or with none at all. */
function principal(overrides: Partial<Principal> = {}): Principal {
  return { id: 'user-1', ...overrides };
}

describe('isAdmin', () => {
  it('is true only for the admin role in app_metadata', () => {
    expect(isAdmin(principal({ app_metadata: { role: 'admin' } }))).toBe(true);
  });

  it('is false for no principal', () => {
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });

  it('is false when the role is absent, empty, or something else', () => {
    expect(isAdmin(principal())).toBe(false);
    expect(isAdmin(principal({ app_metadata: {} }))).toBe(false);
    expect(isAdmin(principal({ app_metadata: null }))).toBe(false);
    expect(isAdmin(principal({ app_metadata: { role: 'user' } }))).toBe(false);
    expect(isAdmin(principal({ app_metadata: { role: 'Admin' } }))).toBe(false);
    expect(isAdmin(principal({ app_metadata: { role: '' } }))).toBe(false);
  });

  it('compares rather than tests truthiness, so a non-string cannot pass', () => {
    // `role: true` read through truthiness would be admin; through comparison it
    // is not, which is the safer of the two behaviours for an authz predicate.
    expect(isAdmin(principal({ app_metadata: { role: true } }))).toBe(false);
    expect(isAdmin(principal({ app_metadata: { role: 1 } }))).toBe(false);
    expect(isAdmin(principal({ app_metadata: { role: ['admin'] } }))).toBe(false);
  });

  it('ignores user_metadata, which the account holder can write', () => {
    // user_metadata is not on the Principal interface on purpose. This is the
    // property: a self-assigned role does not reach the predicate, so it cannot
    // reach an RLS policy that reads the same claim from the JWT.
    const forged = { id: 'user-1' } as Principal;
    (forged as unknown as Record<string, unknown>).user_metadata = { role: 'admin' };
    expect(isAdmin(forged)).toBe(false);
  });
});

describe('canModify', () => {
  it('lets an admin modify a record with no owner', () => {
    // The case #6 described: `ON DELETE SET NULL` leaves an offer nobody owns.
    expect(canModify(principal({ app_metadata: { role: 'admin' } }), null)).toBe(true);
  });

  it('lets an admin modify a record owned by somebody else', () => {
    expect(canModify(principal({ app_metadata: { role: 'admin' } }), 'user-2')).toBe(true);
  });

  it('lets an owner modify their own record', () => {
    expect(canModify(principal(), 'user-1')).toBe(true);
  });

  it('refuses a stranger, and refuses an ownerless record', () => {
    expect(canModify(principal(), 'user-2')).toBe(false);
    expect(canModify(principal(), null)).toBe(false);
  });

  it('refuses a principal with no id', () => {
    // checkOwnership's own null guard, reached through the composition: an
    // admin-shaped app_metadata with no id is still not an admin, because
    // isAdmin needs the role and nothing else, but a non-admin without an id
    // cannot own anything either.
    expect(canModify(principal({ id: null }), 'user-1')).toBe(false);
    expect(canModify(null, 'user-1')).toBe(false);
  });

  it('reduces to checkOwnership when there is no admin', () => {
    fc.assert(
      fc.property(
        fc.option(fc.uuid(), { nil: null }),
        fc.option(fc.uuid(), { nil: null }),
        (userId, recordUserId) => {
          const p: Principal | null = userId === null ? null : { id: userId };
          expect(canModify(p, recordUserId)).toBe(checkOwnership(userId, recordUserId));
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('canDelete', () => {
  it('matches canModify today', () => {
    // They are separate functions so that #54's open question -- whether an admin
    // may delete a record that has an owner -- lands as one changed line here.
    // This test is what makes that separation visible if the two diverge.
    expect(canDelete(principal({ app_metadata: { role: 'admin' } }), 'user-2')).toBe(
      canModify(principal({ app_metadata: { role: 'admin' } }), 'user-2')
    );
  });

  it('refuses a stranger', () => {
    expect(canDelete(principal(), 'user-2')).toBe(false);
  });

  it('lets an owner delete their own record', () => {
    expect(canDelete(principal(), 'user-1')).toBe(true);
  });
});