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
 * The application's public origin, or null when it is not configured.
 *
 * Supabase builds confirmation and recovery links from the project's Site URL
 * dashboard setting when the caller supplies nothing, which defaults to
 * localhost. That setting is invisible from this repository, so the origin has
 * to be configured here instead.
 *
 * Returned as a bare origin with any path, query or trailing slash stripped:
 * a value like `https://app.example.com/` and `https://app.example.com` must
 * not produce `https://app.example.com//offers`.
 */
export function getSiteOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (typeof raw !== "string" || raw.trim() === "") {
    return null;
  }
  try {
    return new URL(raw.trim()).origin;
  } catch {
    // A malformed value is a configuration error, not a reason to hand an
    // attacker-controlled string to Supabase. Treated as unset; the caller
    // logs it.
    return null;
  }
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
