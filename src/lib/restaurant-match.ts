import type { RestaurantSummary } from "@/types/restaurants";

/**
 * The restaurant an offer is bound to before publication (Req 8.1–8.3).
 * The add-flow's assignment step produces it; the offer form and the weekly
 * preview render it instead of free-text restaurant fields, and its values
 * are copied onto the offer as the snapshot at publish time.
 */
export interface AssignedRestaurant {
  id: string;
  name: string;
  address: string | null;
}

/**
 * Normalizes a restaurant name for comparison: trimmed, case-insensitive,
 * internal whitespace collapsed. Deliberately minimal — no diacritic folding,
 * no abbreviations. Two restaurants that differ beyond this are different
 * restaurants until a User says otherwise; the assignment step is the place
 * where that judgment happens.
 */
export function normalizeRestaurantName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Req 8.2: the deterministic match between an extracted restaurant name and
 * the restaurants the existing search returns. No AI matching — the decision
 * must be explainable and stable.
 *
 * Preference order:
 *   1. an exact normalized-name hit among the candidates, even if prefix
 *      siblings matched too ("Bar Mleko" inside "Bar Mleko Nowy Świat");
 *   2. otherwise, a single candidate is taken as the match;
 *   3. otherwise nothing matches and the User decides (Req 8.1).
 *
 * Candidates arrive from `searchRestaurants`, which already filters by
 * substring; this function only refines and guards the empty cases.
 */
export function pickRestaurantMatch(
  extractedName: string | null | undefined,
  candidates: RestaurantSummary[]
): RestaurantSummary | null {
  if (!extractedName || candidates.length === 0) return null;

  const normalized = normalizeRestaurantName(extractedName);
  if (normalized.length === 0) return null;

  const exact = candidates.find(
    (candidate) => normalizeRestaurantName(candidate.name) === normalized
  );
  if (exact) return exact;

  return candidates.length === 1 ? candidates[0] : null;
}
