/**
 * The renewal plan: pure date-and-set arithmetic behind the "wznów" action
 * (Req 8.5–8.6, #71). No database, no clocks -- `today` is always passed in,
 * so calendar behavior is deterministic and testable.
 *
 * The design settled in #68/#71, refined once during implementation:
 *
 * **The anchor rule.** The spec's Req 8.5 window (`today − 7 … today + 6`)
 * bounds how *recent* a renewable menu is, but as a source selector it has a
 * flaw: when today is Monday, the window covers last Monday *and* this
 * Monday, and a dish the User dropped from this week's menu would be
 * resurrected from last week's rows. The fix is to renew **the newest menu
 * week, not everything recent**: `anchor` = the newest available_date among
 * the User's own offers *within the renewable window* (offers already
 * scheduled beyond `today + 6` are the future, not the current menu, and are
 * ignored), and sources are the offers in `[anchor − 6, anchor]` -- a 7-day
 * span that contains every weekday exactly once. A dish absent from the
 * newest week is absent on purpose; a dish older than the anchor week is
 * history. The recency bound survives as the guard: an anchor older than
 * `today − 7` means the menu is too old to renew.
 *
 * **The mapping is `+7`.** Every source keeps its weekday exactly one week
 * ahead. Targets land in `[anchor + 1, anchor + 7]`; with the anchor no
 * older than `today − 7`, the *earliest* possible target is `today − 6` --
 * still valid only when it is not in the past, so a target that lands before
 * `today` (a late renewal, e.g. renewing last week's Monday on a Tuesday) is
 * skipped and reported rather than rejected by the database trigger.
 *
 * **The dedupe is per-User and keyed** on the normalized dish name and the
 * target date: overlapping windows make skipping normal (a Monday renewal
 * maps last week's rows onto this week's existing rows), and the summary
 * reports them rather than failing.
 */

import { normalizeRestaurantName } from "./restaurant-match";
import { toISODate } from "@/utils/day-of-week";

export interface RenewalInputOffer {
  id: string;
  dishName: string;
  /** Local ISO date (YYYY-MM-DD). */
  availableDate: string;
}

export interface RenewalPlanItem {
  offer: RenewalInputOffer;
  targetDate: string;
}

export type RenewalSkipReason = "past-target" | "duplicate";

export interface RenewalSkipped {
  offer: RenewalInputOffer;
  targetDate: string;
  reason: RenewalSkipReason;
}

export interface RenewalPlan {
  /** The newest offer date -- the last day of the menu week being renewed. */
  anchor: string | null;
  toCreate: RenewalPlanItem[];
  skipped: RenewalSkipped[];
}

/** Local calendar arithmetic on ISO dates -- never `toISOString()`. */
export function addDaysISO(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/**
 * The newest offer date among the User's own rows for the restaurant.
 * Null when the User has no offers there -- nothing to renew.
 */
export function renewalAnchor(dates: string[]): string | null {
  if (dates.length === 0) return null;
  return dates.reduce((max, current) => (current > max ? current : max));
}

/** Req 8.5's recency bound: an anchor older than a week is not a menu, it is an archive. */
export function anchorIsTooOld(anchor: string, today: string): boolean {
  return anchor < addDaysISO(today, -7);
}

/**
 * The dedupe key: normalized dish name + exact target date. Normalization is
 * the same trim/case/whitespace rule as restaurant matching -- a stray space
 * must not turn the same dish into two offers on one day.
 */
export function renewalDishKey(dishName: string, date: string): string {
  return `${normalizeRestaurantName(dishName)}|${date}`;
}

/**
 * Plans the renewal from the User's own offers for one restaurant.
 * `offers` should be every such offer (the caller fetches them once); the
 * function picks the anchor week, maps `+7`, and dedupes against both the
 * User's existing upcoming rows and the plan itself.
 */
export function computeRenewalPlan(
  offers: RenewalInputOffer[],
  today: string
): RenewalPlan {
  // The anchor is the newest offer date *within the renewable window*. Offers
  // already scheduled beyond today + 6 are future weeks, not the current
  // menu -- renewing them would duplicate plans the User made on purpose.
  const renewableMax = addDaysISO(today, 6);
  const anchor = renewalAnchor(
    offers
      .filter((offer) => offer.availableDate <= renewableMax)
      .map((offer) => offer.availableDate)
  );
  if (!anchor) {
    return { anchor: null, toCreate: [], skipped: [] };
  }

  const windowStart = addDaysISO(anchor, -6);
  const sources = offers
    .filter(
      (offer) =>
        offer.availableDate >= windowStart && offer.availableDate <= anchor
    )
    .sort((a, b) => a.availableDate.localeCompare(b.availableDate));

  // The User's own rows from today onward are what the targets would
  // duplicate against; past rows are history and never block a renewal.
  const existingKeys = new Set(
    offers
      .filter((offer) => offer.availableDate >= today)
      .map((offer) => renewalDishKey(offer.dishName, offer.availableDate))
  );

  const toCreate: RenewalPlanItem[] = [];
  const skipped: RenewalSkipped[] = [];
  const plannedKeys = new Set<string>();

  for (const offer of sources) {
    const targetDate = addDaysISO(offer.availableDate, 7);

    if (targetDate < today) {
      skipped.push({ offer, targetDate, reason: "past-target" });
      continue;
    }

    const key = renewalDishKey(offer.dishName, targetDate);
    if (existingKeys.has(key) || plannedKeys.has(key)) {
      skipped.push({ offer, targetDate, reason: "duplicate" });
      continue;
    }

    plannedKeys.add(key);
    toCreate.push({ offer, targetDate });
  }

  return { anchor, toCreate, skipped };
}
