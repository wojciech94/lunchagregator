// Feature: user-authentication, Property 2: redirectTo sanitization only accepts internal paths

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { sanitizeRedirectTo } from "@/lib/auth";

/**
 * Validates: Requirements 2.2
 *
 * Property 2: redirectTo sanitization only accepts internal paths
 * For every redirect value, preserve it exactly only when it starts with a
 * single slash; otherwise use the root path as the safe fallback.
 */
describe("Property 2: redirectTo sanitization only accepts internal paths", () => {
  it("preserves only internal, non-protocol-relative paths", () => {
    fc.assert(
      fc.property(fc.string(), (redirectTo) => {
        const expected =
          redirectTo.startsWith("/") && !redirectTo.startsWith("//")
            ? redirectTo
            : "/";

        expect(sanitizeRedirectTo(redirectTo)).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });
});
