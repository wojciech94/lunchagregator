// Feature: user-authentication, Property 2: redirectTo sanitization only accepts internal paths

import { describe, expect, it, afterEach } from "vitest";
import fc from "fast-check";
import {
  buildEmailRedirectTo,
  getSiteOrigin,
  sanitizeRedirectTo,
} from "@/lib/auth";

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

describe("getSiteOrigin", () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = original;
    }
  });

  it("is null when unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(getSiteOrigin()).toBeNull();
  });

  it("is null when blank", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "   ";
    expect(getSiteOrigin()).toBeNull();
  });

  it("is null for a malformed value rather than passing it through", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "not a url";
    expect(getSiteOrigin()).toBeNull();
  });

  it("strips a trailing slash so links do not double up", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com/";
    expect(getSiteOrigin()).toBe("https://app.example.com");
  });

  it("strips any path, keeping only the origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com/some/path?x=1";
    expect(getSiteOrigin()).toBe("https://app.example.com");
  });

  it("keeps a non-default port, which is what local development needs", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    expect(getSiteOrigin()).toBe("http://localhost:3000");
  });
});

describe("buildEmailRedirectTo", () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = original;
    }
  });

  it("is undefined when no origin is configured, so signUp gets no link", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(buildEmailRedirectTo("/add")).toBeUndefined();
  });

  it("composes the origin with the requested destination", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
    expect(buildEmailRedirectTo("/restaurants/new")).toBe(
      "https://app.example.com/restaurants/new"
    );
  });

  it("falls back to the root when no destination was requested", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
    expect(buildEmailRedirectTo(null)).toBe("https://app.example.com/");
  });

  it("cannot be pushed off the configured origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
    expect(buildEmailRedirectTo("https://evil.example/steal")).toBe(
      "https://app.example.com/"
    );
  });

  it("cannot be pushed off via a protocol-relative path", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
    expect(buildEmailRedirectTo("//evil.example/steal")).toBe(
      "https://app.example.com/"
    );
  });

  it("keeps every result on the configured origin, for any input", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
    fc.assert(
      fc.property(fc.string(), (destination) => {
        const built = buildEmailRedirectTo(destination);
        expect(built).toBeDefined();
        expect(new URL(built as string).origin).toBe("https://app.example.com");
      }),
      { numRuns: 100 }
    );
  });
});