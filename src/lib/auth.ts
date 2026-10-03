import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns the authenticated user from the current request context,
 * or null if no valid session exists.
 * Uses supabase.auth.getUser() which validates the JWT server-side.
 */
export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return data.user;
}

/**
 * Sanitizes the `redirectTo` query parameter to prevent open redirect attacks.
 * Returns the value unchanged only when it starts with `/` and not `//`.
 * All other values (external URLs, protocol-relative URLs, empty strings, null/undefined)
 * fall back to `/`.
 */
export function sanitizeRedirectTo(
  value: string | null | undefined
): string {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/";
}

/**
 * Normalises one candidate value to a bare origin, or null.
 *
 * Vercel's injected variables hold a bare host with no scheme
 * (`lunchagregator.vercel.app`), which `new URL` rejects outright. A scheme is
 * therefore supplied when one is missing — https, except for loopback hosts,
 * which the local stack genuinely serves over http.
 */
function toOrigin(value: string | undefined): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).origin;
    } catch {
      return null;
    }
  }
  // Loopback is served over http by the local stack, and `vercel dev` too.
  const isLoopback = /^(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(trimmed);
  const withScheme = isLoopback ? `http://${trimmed}` : `https://${trimmed}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    // A malformed value is a configuration error, not a reason to hand an
    // attacker-controlled string to Supabase. Treated as unset; the caller
    // logs it.
    return null;
  }
}

/**
 * The application's public origin, or null when it cannot be determined.
 *
 * Resolution order, most authoritative first:
 *
 *  1. `NEXT_PUBLIC_SITE_URL` — set this for a custom domain, or for any host
 *     that is not Vercel.
 *  2. `VERCEL_PROJECT_PRODUCTION_URL` — injected by Vercel, no configuration
 *     needed on the platform this app is deployed to.
 *  3. `VERCEL_URL` — the specific deployment, including preview builds.
 *
 * The production URL is preferred over the deployment URL so that a preview
 * build sharing the production database still sends people to a host that
 * exists, rather than at an ephemeral preview.
 *
 * Never derived from a request header. `Host` and `X-Forwarded-Host` are
 * supplied by the client, and this value is interpolated into a link the User
 * will click from an email; a poisoned header would redirect that link
 * anywhere. Every source here is set by the platform, not the caller.
 *
 * Returned as a bare origin with any path, query or trailing slash stripped,
 * so `https://app.example.com/` and `https://app.example.com` cannot produce
 * `https://app.example.com//offers`.
 */
export function getSiteOrigin(): string | null {
  return (
    toOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
    toOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    toOrigin(process.env.VERCEL_URL)
  );
}

/**
 * Node/undici error codes that mean "the request never reached the provider".
 */
const CONNECTIVITY_CAUSE_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
]);

/**
 * True when a Supabase call failed to reach the provider at all, rather than
 * being rejected by it.
 *
 * This is not a guess at message text. Captured from a real
 * `signUp` against a host that does not resolve:
 *
 *   name     AuthRetryableFetchError
 *   message  'fetch failed'
 *   status   0
 *   code     undefined
 *   cause    Error { code: 'ENOTFOUND', errno: -3008 }
 *
 * Three details matter. `status` is 0 because there is no HTTP response to
 * carry one. `code` is undefined, so a classifier that checks it sees nothing.
 * And the diagnostic that actually says what went wrong is on `cause`, one
 * level down — a classifier reading only the top-level message cannot tell
 * this apart from a provider rejection.
 *
 * The cause chain is walked because wrappers differ by SDK version and by
 * runtime; `cause` may hold the value directly or behind another wrapper.
 *
 * A provider rejection carries a real status and a real error code, so it
 * never matches here.
 */
export function isConnectivityError(error: unknown): boolean {
  let current: unknown = error;

  // Bounded because `cause` is attacker-influenced in principle and an
  // unbounded walk would be a hazard in a request path.
  for (let depth = 0; depth < 5; depth++) {
    if (typeof current !== 'object' || current === null) {
      return false;
    }

    const candidate = current as {
      status?: unknown;
      statusCode?: unknown;
      code?: unknown;
      name?: unknown;
      message?: unknown;
      cause?: unknown;
    };

    if (candidate.status === 0 || candidate.statusCode === 0) {
      return true;
    }

    if (
      typeof candidate.name === 'string' &&
      /RetryableFetchError$/i.test(candidate.name)
    ) {
      return true;
    }

    if (
      typeof candidate.code === 'string' &&
      CONNECTIVITY_CAUSE_CODES.has(candidate.code)
    ) {
      return true;
    }

    if (
      typeof candidate.message === 'string' &&
      /\bfetch failed\b/i.test(candidate.message)
    ) {
      return true;
    }

    current = candidate.cause;
  }

  return false;
}

/**
 * Absolute URL for an email link, or undefined when no origin is configured.
 *
 * The path still goes through sanitizeRedirectTo, so a `redirectTo` arriving
 * from the form cannot move the confirmation link off this origin.
 */
export function buildEmailRedirectTo(
  destination: string | null | undefined
): string | undefined {
  const origin = getSiteOrigin();
  if (origin === null) {
    return undefined;
  }
  return `${origin}${sanitizeRedirectTo(destination)}`;
}
