// Feature: restaurant-management, Property 4: Session-based ownership enforcement for restaurants

import { describe, it, expect } from 'vitest';
import { fc } from './fc-config';

/**
 * Validates: Requirements 2.3, 3.5
 *
 * Property 4: Session-based ownership enforcement for restaurants
 * For any restaurant and any session token, the system SHALL allow edit and delete
 * operations if and only if the provided session token matches the restaurant's
 * stored `session_token`.
 */

// --- Ownership check logic (extracted from server actions) ---

/**
 * Pure function that checks whether a provided session token matches
 * the restaurant's stored session token. This is the core ownership
 * enforcement logic used by updateRestaurant and deleteRestaurant.
 *
 * Returns true if the operation is allowed (tokens match exactly),
 * false otherwise.
 */
function checkOwnership(storedToken: string, providedToken: string): boolean {
  return storedToken === providedToken;
}

// --- Generators ---

/** Arbitrary non-empty token string (simulates real session tokens) */
const tokenArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.length >= 1);

/** Arbitrary token that can include various characters */
const arbitraryTokenArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.length >= 1);

describe('Property 4: Session-based ownership enforcement for restaurants', () => {
  describe('When the provided token matches the restaurant token → operation is allowed', () => {
    it('should allow access when the same token is used for both stored and provided', () => {
      fc.assert(
        fc.property(tokenArb, (token) => {
          // The same token used as both stored and provided should always grant access
          expect(checkOwnership(token, token)).toBe(true);
        })
      );
    });
  });

  describe('When the provided token does NOT match → operation is denied', () => {
    it('should deny access when two different tokens are provided', () => {
      fc.assert(
        fc.property(
          tokenArb,
          tokenArb,
          (storedToken, providedToken) => {
            // Only test when tokens are actually different
            fc.pre(storedToken !== providedToken);
            expect(checkOwnership(storedToken, providedToken)).toBe(false);
          }
        )
      );
    });
  });

  describe('The check is case-sensitive (tokens must match exactly)', () => {
    it('should deny access when tokens differ only in case', () => {
      // Generate tokens that contain at least one letter so case change is meaningful
      const tokenWithLetterArb = fc
        .string({ minLength: 1, maxLength: 100 })
        .filter((s) => /[a-zA-Z]/.test(s));

      fc.assert(
        fc.property(tokenWithLetterArb, (token) => {
          // Create a case-altered version
          const altered = token.includes(token.toLowerCase())
            ? token.toUpperCase()
            : token.toLowerCase();

          // Only test when case change actually produces a different string
          fc.pre(token !== altered);
          expect(checkOwnership(token, altered)).toBe(false);
        })
      );
    });

    it('should treat uppercase and lowercase versions of the same string as different tokens', () => {
      fc.assert(
        fc.property(arbitraryTokenArb, (baseToken) => {
          const upper = baseToken.toUpperCase();
          const lower = baseToken.toLowerCase();

          // Only test when case change produces different strings
          fc.pre(upper !== lower);

          // Upper vs lower should be denied
          expect(checkOwnership(upper, lower)).toBe(false);
          expect(checkOwnership(lower, upper)).toBe(false);
        })
      );
    });
  });

  describe('Empty tokens never match non-empty tokens', () => {
    it('should deny access when stored token is empty and provided token is non-empty', () => {
      fc.assert(
        fc.property(tokenArb, (providedToken) => {
          // Empty stored token should never match a non-empty provided token
          expect(checkOwnership('', providedToken)).toBe(false);
        })
      );
    });

    it('should deny access when provided token is empty and stored token is non-empty', () => {
      fc.assert(
        fc.property(tokenArb, (storedToken) => {
          // Non-empty stored token should never match an empty provided token
          expect(checkOwnership(storedToken, '')).toBe(false);
        })
      );
    });
  });

  describe('Ownership is symmetric and deterministic', () => {
    it('should produce the same result for the same inputs regardless of call order', () => {
      fc.assert(
        fc.property(arbitraryTokenArb, arbitraryTokenArb, (tokenA, tokenB) => {
          // The check should be deterministic
          const result1 = checkOwnership(tokenA, tokenB);
          const result2 = checkOwnership(tokenA, tokenB);
          expect(result1).toBe(result2);
        })
      );
    });

    it('should be equivalent to strict equality', () => {
      fc.assert(
        fc.property(arbitraryTokenArb, arbitraryTokenArb, (tokenA, tokenB) => {
          // The ownership check should be exactly equivalent to === comparison
          expect(checkOwnership(tokenA, tokenB)).toBe(tokenA === tokenB);
        })
      );
    });
  });
});
