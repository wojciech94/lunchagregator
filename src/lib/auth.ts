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
