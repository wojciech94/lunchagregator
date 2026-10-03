// Feature: user-authentication, Property 6: Ownership check correctness

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkOwnership } from '@/lib/ownership';

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
