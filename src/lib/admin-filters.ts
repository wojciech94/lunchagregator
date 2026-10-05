/**
 * Filters the admin panel reads from the query string (#77).
 *
 * A plain function on purpose: the toggle component is a client component,
 * and a server page cannot call a function exported from a `"use client"`
 * module. The filter itself is URL-driven -- the same decision Requirement 2
 * settled for the public listing.
 */

/** Reads the filter out of the query string. Absent means "show everything". */
export function isOrphanOnly(
  params: Record<string, string | string[] | undefined>
): boolean {
  const value = params.orphan;
  return value === '1';
}
