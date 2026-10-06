import { describe, expect, it } from "vitest";
import { parseFiltersFromSearchParams, filtersToSearchParams } from "./filter-url";

describe("offer URL criteria", () => {
  it("retains a reversed price range and unrelated criteria for visible validation", () => {
    const parsed = parseFiltersFromSearchParams(new URLSearchParams(
      "date=2026-10-08&priceMin=50&priceMax=30&cuisines=polska&diets=vegetarian&sort=price_asc&radius=5"
    ));
    expect(parsed.filters).toMatchObject({ date: "2026-10-08", price: { min: 50, max: 30 }, cuisineTypes: ["polska"], dietaryTags: ["vegetarian"], sortBy: "price_asc" });
    expect(parsed.radius).toBe(5);
  });

  it("accepts one-sided price links without discarding date or cuisine", () => {
    expect(parseFiltersFromSearchParams(new URLSearchParams("date=2026-10-08&priceMin=50&cuisines=polska")).filters)
      .toMatchObject({ date: "2026-10-08", price: { min: 50, max: 999.99 }, cuisineTypes: ["polska"] });
  });

  it("isolates an invalid sort instead of dropping valid criteria", () => {
    expect(parseFiltersFromSearchParams(new URLSearchParams("date=2026-10-08&sort=unknown&diets=vegetarian")).filters)
      .toMatchObject({ date: "2026-10-08", dietaryTags: ["vegetarian"] });
  });

  it("rejects impossible dates and out-of-range radii", () => {
    const parsed = parseFiltersFromSearchParams(new URLSearchParams("date=2026-02-30&radius=100&cuisines=polska"));
    expect(parsed.filters).toEqual({ cuisineTypes: ["polska"] });
    expect(parsed.radius).toBeUndefined();
  });

  it("round-trips committed criteria without publishing internal pagination limits", () => {
    const filters = { date: "2026-10-08", price: { min: 20, max: 50 }, dietaryTags: ["vegetarian" as const], page: 2 };
    expect(parseFiltersFromSearchParams(filtersToSearchParams(filters)).filters).toEqual(filters);
    expect(filtersToSearchParams({ ...filters, limit: 50 }).has("limit")).toBe(false);
  });
});
