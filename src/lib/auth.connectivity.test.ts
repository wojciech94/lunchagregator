/**
 * The classifier is written against an error shape captured from a real
 * `signUp` against an unresolvable host, so these cases are the real one
 * first and the plausible variants after it.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { isConnectivityError } from "@/lib/auth";

/** Exactly what supabase-js produced, nested cause included. */
function capturedFetchFailure() {
  const cause = Object.assign(new Error("getaddrinfo ENOTFOUND app.invalid"), {
    errno: -3008,
    code: "ENOTFOUND",
    syscall: "getaddrinfo",
  });
  return Object.assign(new Error("fetch failed"), {
    __isAuthError: true,
    status: 0,
    cause,
  });
}

describe("isConnectivityError", () => {
  it("recognises the captured error", () => {
    expect(isConnectivityError(capturedFetchFailure())).toBe(true);
  });

  it("recognises it under the SDK's own class name", () => {
    const error = capturedFetchFailure();
    Object.defineProperty(error, "name", { value: "AuthRetryableFetchError" });
    expect(isConnectivityError(error)).toBe(true);
  });

  it("finds the cause behind an extra wrapper layer", () => {
    // SDK versions differ in how deep the useful part sits.
    const error = Object.assign(new Error("wrapped"), {
      cause: { cause: capturedFetchFailure() },
    });
    expect(isConnectivityError(error)).toBe(true);
  });

  it.each([
    ["ENOTFOUND", "unknown host"],
    ["EAI_AGAIN", "temporary DNS failure"],
    ["ECONNREFUSED", "port closed"],
    ["ECONNRESET", "connection reset"],
    ["EHOSTUNREACH", "host unreachable"],
    ["ENETUNREACH", "network unreachable"],
    ["ETIMEDOUT", "timed out"],
  ])("recognises the %s cause code (%s)", (code) => {
    expect(isConnectivityError({ cause: Object.assign(new Error("x"), { code }) })).toBe(
      true
    );
  });

  it.each([
    ["a provider rejection with a real status", { status: 400, code: "email_not_confirmed" }],
    ["an unexpected provider error", { status: 500, code: "unexpected_error" }],
    ["a duplicate email", { status: 422, code: "user_already_exists" }],
    ["a rate limit", { status: 429, code: "over_email_send_rate_limit" }],
    ["a validation error", { status: 400, code: "weak_password" }],
    ["an AuthApiError-shaped object", { __isAuthError: true, status: 400, name: "AuthApiError" }],
  ])("does not mistake %s for a connectivity failure", (_label, shape) => {
    expect(isConnectivityError(shape)).toBe(false);
  });

  it("is false for values that are not error-shaped", () => {
    for (const value of [null, undefined, 0, "", false, {}, []]) {
      expect(isConnectivityError(value)).toBe(false);
    }
  });

  it("terminates on a self-referencing cause chain", () => {
    const error: Record<string, unknown> = {};
    error.cause = error;
    expect(isConnectivityError(error)).toBe(false);
  });

  it("never reports a provider rejection as connectivity, for any shape", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 400, max: 599 }),
        fc.string(),
        (status, code) => {
          expect(isConnectivityError({ status, code })).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });
});