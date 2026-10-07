import { distanceFilterSchema, offerFiltersSchema } from "@/lib/validations/filters";
import type { OfferFilters } from "@/types/filters";

export interface ParsedUrlFilters {
  /** Parsed criteria, including numeric price drafts rejected by validation. */
  filters: OfferFilters;
  /**
   * Radius from the URL, kept separate.
   *
   * `distanceFilterSchema` needs a radius *and* an origin, and the origin is
   * not in the URL -- coordinates live in the cookie. So the radius cannot be
   * completed here; the server pairs it with the cookie value. A radius without
   * a location filters nothing, and Requirement 2.12 says to say so rather than
   * drop it.
   */
  radius?: number;
}

/**
 * Reads offer filters out of a URL query string.
 *
 * `offerFiltersSchema` is the parse target on purpose: it already describes
 * exactly what the server accepts, so a second schema here would be one more
 * thing to keep in sync and one more thing to eventually let drift.
 *
 * Validate criteria independently: one malformed value must not erase the
 * selected day or unrelated criteria. Numeric price drafts stay intact even
 * when invalid, so the form can explain them and the server action rejects
 * them instead of silently broadening the query.
 */
export function parseFiltersFromSearchParams(params: URLSearchParams): ParsedUrlFilters {
  const raw: Record<string, string | string[]> = {};

  for (const key of ["radius", "priceMin", "priceMax", "sort", "page", "q"]) {
    const value = params.get(key);
    if (value !== null && value !== "") {
      raw[key] = value;
    }
  }

  for (const key of ["cuisines", "diets"]) {
    const values = params.getAll(key).filter(Boolean);
    if (values.length > 0) {
      // Accept both `?cuisines=polska&cuisines=wloska` and
      // `?cuisines=polska,wloska`, because both appear in the wild and the
      // second is what people paste out of a shared link.
      raw[key] = values.flatMap((value) => value.split(","));
    }
  }

  const date = params.get("date");
  if (date) {
    raw.date = date;
  }

  const candidateRadius = toNumber(raw.radius);
  const radiusValue = candidateRadius !== undefined &&
    distanceFilterSchema.shape.radius.safeParse(candidateRadius).success
    ? candidateRadius : undefined;
  const query = coerceQuery(raw);
  const filters: OfferFilters = {};
  for (const key of ["date", "page", "sortBy", "searchQuery", "cuisineTypes", "dietaryTags"] as const) {
    if (query[key] === undefined) continue;
    const parsed = offerFiltersSchema.shape[key].safeParse(query[key]);
    if (parsed.success) Object.assign(filters, { [key]: parsed.data });
  }
  if (query.price) filters.price = query.price;

  return {
    filters,
    ...(radiusValue === undefined ? {} : { radius: radiusValue }),
  };
}

function toNumber(value: string | string[] | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) ? n : undefined;
}

/** Query strings carry strings; the schema wants numbers and enums. */
function coerceQuery(raw: Record<string, string | string[]>): Record<string, unknown> & { price?: OfferFilters["price"] } {
  const result: Record<string, unknown> & { price?: OfferFilters["price"] } = {};

  const min = toNumber(raw.priceMin);
  const max = toNumber(raw.priceMax);
  if (min !== undefined || max !== undefined) {
    result.price = { min: min ?? 0.01, max: max ?? 999.99 };
  }

  const page = toNumber(raw.page);
  if (page !== undefined) result.page = page;
  if (raw.sort !== undefined) result.sortBy = raw.sort;
  if (raw.q !== undefined) result.searchQuery = raw.q;
  if (raw.date !== undefined) result.date = raw.date;
  if (raw.cuisines !== undefined) result.cuisineTypes = raw.cuisines;
  if (raw.diets !== undefined) result.dietaryTags = raw.diets;

  return result;
}

/**
 * Pairs a URL radius with the location the server already knows, which is the
 * only way to produce a valid distance filter. Returns the filters unchanged
 * when there is nothing to pair, because a radius with no origin filters
 * nothing and Requirement 2.12 wants that reported rather than removed.
 */
export function withDistanceFilter(
  filters: OfferFilters,
  radius: number | undefined,
  origin: { latitude: number; longitude: number } | undefined
): OfferFilters {
  if (radius === undefined || origin === undefined) {
    return filters;
  }
  return { ...filters, distance: { radius, from: origin } };
}

/**
 * The inverse: filters to a query string.
 *
 * Only user-chosen state is written. `limit` is deliberately excluded -- no
 * User picks it, it never changes in the UI, and publishing it would only
 * expose an internal constant. See Requirement 2.9.
 */
export function filtersToSearchParams(filters: OfferFilters): URLSearchParams {
  const params = new URLSearchParams();

  const distance = filters.distance;
  if (distance?.radius !== undefined) {
    params.set("radius", String(distance.radius));
  }
  if (filters.price?.min !== undefined) {
    params.set("priceMin", String(filters.price.min));
  }
  if (filters.price?.max !== undefined) {
    params.set("priceMax", String(filters.price.max));
  }
  if (filters.cuisineTypes?.length) {
    params.set("cuisines", filters.cuisineTypes.join(","));
  }
  if (filters.dietaryTags?.length) {
    params.set("diets", filters.dietaryTags.join(","));
  }
  if (filters.searchQuery) {
    params.set("q", filters.searchQuery);
  }
  if (filters.sortBy) {
    params.set("sort", filters.sortBy);
  }
  if (filters.date) {
    params.set("date", filters.date);
  }
  if (filters.page && filters.page > 1) {
    params.set("page", String(filters.page));
  }

  return params;
}
