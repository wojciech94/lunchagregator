/**
 * Tests for the deterministic extraction→restaurant match (Req 8.2, #70).
 *
 * The match is the one place where an AI string meets the restaurants table,
 * so its rules are pinned from both sides: unit cases for the decisions the
 * add flow branches on, and property tests for the invariants that must hold
 * for every generated candidate list.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { RestaurantSummary } from "@/types/restaurants";
import {
  normalizeRestaurantName,
  pickRestaurantMatch,
} from "./restaurant-match";

function restaurant(
  id: string,
  name: string,
  address: string | null = "ul. Testowa 1, Warszawa"
): RestaurantSummary {
  return { id, name, address, cuisineTypes: [] };
}

describe("normalizeRestaurantName", () => {
  it("trims, lowercases and collapses internal whitespace", () => {
    expect(normalizeRestaurantName("  Bar   MLEKO  ")).toBe("bar mleko");
  });

  it("does not fold diacritics — those are different names on purpose", () => {
    expect(normalizeRestaurantName("Łososiowa")).not.toBe("lososiowa");
  });
});

describe("pickRestaurantMatch", () => {
  it("prefers an exact normalized hit even when prefix siblings matched too", () => {
    const candidates = [
      restaurant("r-1", "Bar Mleko Nowy Świat"),
      restaurant("r-2", "Bar Mleko"),
      restaurant("r-3", "Bar Mlekomat"),
    ];

    expect(pickRestaurantMatch("Bar Mleko", candidates)?.id).toBe("r-2");
  });

  it("matches case-insensitively and around stray whitespace", () => {
    const candidates = [restaurant("r-1", "  bar   mleko ")];

    expect(pickRestaurantMatch(" Bar Mleko ", candidates)?.id).toBe("r-1");
  });

  it("takes a lone candidate even when it is only a substring hit", () => {
    const candidates = [restaurant("r-1", "Bar Mleko Nowy Świat")];

    expect(pickRestaurantMatch("Bar Mleko", candidates)?.id).toBe("r-1");
  });

  it("returns null when several candidates match but none exactly", () => {
    const candidates = [
      restaurant("r-1", "Bar Mleko Nowy Świat"),
      restaurant("r-2", "Bar Mlekomat"),
    ];

    expect(pickRestaurantMatch("Bar Mleko", candidates)).toBeNull();
  });

  it("returns null for an empty or blank extracted name", () => {
    expect(pickRestaurantMatch(null, [restaurant("r-1", "Bar Mleko")])).toBeNull();
    expect(pickRestaurantMatch("   ", [restaurant("r-1", "Bar Mleko")])).toBeNull();
  });

  it("returns null when the search returned nothing", () => {
    expect(pickRestaurantMatch("Bar Mleko", [])).toBeNull();
  });
});

describe("pickRestaurantMatch: properties", () => {
  it("P1: an exact normalized hit wins no matter where it sits in the list", () => {
    const exactName = fc
      .string({ minLength: 1, maxLength: 30 })
      .filter((value) => normalizeRestaurantName(value).length > 0);
    const otherName = fc
      .string({ minLength: 1, maxLength: 30 })
      .filter((value) => normalizeRestaurantName(value).length > 0);

    const listsWithExact = fc
      .tuple(exactName, fc.array(otherName, { maxLength: 5 }), fc.integer({ min: 0, max: 2 }))
      .map(([name, others, position]) => {
        // Only candidates the search would plausibly return: every name
        // contains the extracted string, none normalizes equal to it.
        const candidates = [
          ...others.slice(0, position).map((n, i) => restaurant(`r-o-${i}`, `${name} ${n}`)),
          restaurant("r-exact", name),
          ...others.slice(position).map((n, i) => restaurant(`r-o-${i}`, `${n} ${name}`)),
        ];
        return { candidates, name };
      });

    fc.assert(
      fc.property(listsWithExact, ({ candidates, name }) => {
        const match = pickRestaurantMatch(name, candidates);
        expect(match?.id).toBe("r-exact");
      })
    );
  });

  it("P2: without an exact hit, two or more candidates mean the User decides", () => {
    const base = fc
      .string({ minLength: 1, maxLength: 30 })
      .filter((value) => normalizeRestaurantName(value).length > 0);

    const ambiguous = fc
      .tuple(base, base)
      .filter(
        ([a, b]) =>
          normalizeRestaurantName(a) !== normalizeRestaurantName(b) &&
          !normalizeRestaurantName(a).includes(normalizeRestaurantName(b)) &&
          !normalizeRestaurantName(b).includes(normalizeRestaurantName(a))
      )
      .map(([a, b]) => {
        const extracted = a;
        const candidates = [
          restaurant("r-1", `${a} alfa`),
          restaurant("r-2", `${b} beta`),
        ];
        return { extracted, candidates };
      });

    fc.assert(
      fc.property(ambiguous, ({ extracted, candidates }) => {
        expect(pickRestaurantMatch(extracted, candidates)).toBeNull();
      })
    );
  });

  it("P3: casing and whitespace around the extracted name change nothing", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((value) => normalizeRestaurantName(value).length > 0),
        fc.constantFrom("  ", "\t", " \t "),
        fc.constantFrom("lower", "UPPER", "Title Case"),
        (name, padding, casing) => {
          const decorated =
            padding +
            (casing === "lower" ? name.toLowerCase() : casing === "UPPER" ? name.toUpperCase() : name) +
            padding;
          const candidates = [restaurant("r-1", name)];

          expect(pickRestaurantMatch(decorated, candidates)?.id).toBe(
            pickRestaurantMatch(name, candidates)?.id
          );
        }
      )
    );
  });
});
