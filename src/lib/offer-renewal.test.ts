/**
 * Tests for the renewal plan (Req 8.5–8.6, #71) -- the pure core of the
 * "wznów" action. The clock is never read: `today` is an argument, and every
 * scenario is pinned to concrete dates the way the driving dev described the
 * rhythm: a Mon–Fri menu, renewed once a week, from any weekday.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  anchorIsTooOld,
  computeRenewalPlan,
  renewalAnchor,
  renewalDishKey,
  type RenewalInputOffer,
} from "./offer-renewal";

/** A Mon–Fri menu whose week is anchored by its Friday. */
function weekDishes(weekAnchorFriday: string, dishes: string[]): RenewalInputOffer[] {
  // Monday of that week is Friday − 4.
  const monday = addDaysISO(weekAnchorFriday, -4);
  return dishes.map((dishName, index) => ({
    id: `offer-${index}`,
    dishName,
    availableDate: addDaysISO(monday, index),
  }));
}

describe("addDaysISO", () => {
  it("crosses month and year boundaries on the local calendar", () => {
    expect(addDaysISO("2026-07-31", 7)).toBe("2026-08-07");
    expect(addDaysISO("2026-12-30", 7)).toBe("2027-01-06");
    expect(addDaysISO("2026-03-01", -7)).toBe("2026-02-22");
  });
});

describe("renewalAnchor", () => {
  it("is the newest date, or null when the restaurant has none of the User's offers", () => {
    expect(renewalAnchor(["2026-10-05", "2026-10-09", "2026-10-02"])).toBe("2026-10-09");
    expect(renewalAnchor([])).toBeNull();
  });
});

describe("anchorIsTooOld", () => {
  it("rejects an anchor older than seven days and accepts one exactly seven days back", () => {
    expect(anchorIsTooOld("2026-09-26", "2026-10-05")).toBe(true);
    expect(anchorIsTooOld("2026-09-28", "2026-10-05")).toBe(false);
  });
});

describe("computeRenewalPlan: the weekly rhythm", () => {
  it("Wednesday renewal: this week's full Mon–Fri menu maps to next week, expired days included", () => {
    // Today is Wednesday 2026-10-07; the menu week is Mon 05 – Fri 09.
    const sources = weekDishes("2026-10-09", ["Naleśniki", "Pierogi", "Żurek", "Kotlet", "Ryba"]);
    // Plus last week's tail, which the anchor week excludes.
    const lastWeek = weekDishes("2026-10-02", ["Naleśniki", "Pierogi"]);

    const plan = computeRenewalPlan([...sources, ...lastWeek], "2026-10-07");

    expect(plan.anchor).toBe("2026-10-09");
    expect(plan.toCreate).toHaveLength(5);
    // Wednesday's dish renews to NEXT Wednesday, not today (the inclusive
    // next-occurrence rule would have collided it with today's own row).
    expect(plan.toCreate.map((item) => item.targetDate)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
    ]);
    expect(plan.skipped).toHaveLength(0);
  });

  it("Monday renewal: the anchor week maps to next week; last week contributes nothing", () => {
    // Today is Monday 2026-10-05. Last week's menu (Sep 28 – Oct 2) and this
    // week's (Oct 5 – 9, published this morning) both exist.
    const lastWeek = weekDishes("2026-10-02", ["Zestaw", "Pierogi", "Żurek", "Kotlet", "Ryba"]);
    const thisWeek = weekDishes("2026-10-09", ["Zestaw", "Pierogi", "Żurek", "Kotlet", "Ryba"]);

    const plan = computeRenewalPlan([...lastWeek, ...thisWeek], "2026-10-05");

    expect(plan.anchor).toBe("2026-10-09");
    // This week's five dishes become next week's menu...
    expect(plan.toCreate).toHaveLength(5);
    expect(plan.toCreate.map((item) => item.targetDate)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
    ]);
    // ...and last week's rows are not sources at all: the anchor week is
    // [Oct 3 – Oct 9], so nothing from September can leak into the plan.
    expect(plan.skipped).toHaveLength(0);
    for (const item of plan.toCreate) {
      expect(item.offer.availableDate >= "2026-10-03").toBe(true);
    }
  });

  it("the resurrection guard: a dish dropped from the newest week is not brought back", () => {
    // This week's menu dropped "Zupa"; last week still had it. Renewing on
    // Tuesday must NOT resurrect it from last week's rows.
    const thisWeek = weekDishes("2026-10-09", ["Zestaw", "Pierogi", "Żurek", "Kotlet", "Ryba"]);
    const lastWeek = [
      ...weekDishes("2026-10-02", ["Zestaw", "Pierogi", "Żurek", "Kotlet", "Ryba"]),
      { id: "offer-zupa", dishName: "Zupa", availableDate: "2026-09-28" },
    ];

    const plan = computeRenewalPlan([...lastWeek, ...thisWeek], "2026-10-06");

    const names = plan.toCreate.map((item) => item.offer.dishName);
    expect(names).not.toContain("Zupa");
    expect(names).toHaveLength(5);
  });

  it("a late renewal skips the days that already passed and reports why", () => {
    // The menu week is Mon 28 Sep – Fri 02 Oct; today is Tuesday 06 Oct.
    // +7 from Monday lands on yesterday (past → skipped); Tuesday's own
    // target is today, which the INSERT trigger accepts; Wednesday through
    // Friday follow.
    const sources = weekDishes("2026-10-02", ["Zestaw", "Pierogi", "Żurek", "Kotlet", "Ryba"]);

    const plan = computeRenewalPlan(sources, "2026-10-06");

    expect(plan.toCreate.map((item) => item.offer.dishName)).toEqual([
      "Pierogi",
      "Żurek",
      "Kotlet",
      "Ryba",
    ]);
    const past = plan.skipped.filter((entry) => entry.reason === "past-target");
    expect(past.map((entry) => entry.offer.dishName)).toEqual(["Zestaw"]);
  });

  it("reports nothing renewable when the anchor is older than a week", () => {
    const sources = weekDishes("2026-09-25", ["Zestaw", "Pierogi", "Żurek", "Kotlet", "Ryba"]);

    const plan = computeRenewalPlan(sources, "2026-10-05");

    expect(plan.anchor).toBe("2026-09-25");
    expect(anchorIsTooOld(plan.anchor!, "2026-10-05")).toBe(true);
    expect(plan.toCreate).toHaveLength(0);
  });

  it("an empty restaurant plans nothing", () => {
    const plan = computeRenewalPlan([], "2026-10-05");
    expect(plan.anchor).toBeNull();
    expect(plan.toCreate).toHaveLength(0);
  });

  it("offers already scheduled beyond today + 6 are the future, not the current menu", () => {
    // This week's menu (Mon 05 – Fri 09) plus two weeks the User added by
    // hand (Mon 12 – Tue 13). The anchor must stay on Oct 9, so the renewal
    // plans next week from this week and never copies the future weeks.
    const thisWeek = weekDishes("2026-10-09", ["Zestaw", "Pierogi", "Żurek", "Kotlet", "Ryba"]);
    const future = [
      { id: "offer-f1", dishName: "Zestaw", availableDate: "2026-10-12" },
      { id: "offer-f2", dishName: "Pierogi", availableDate: "2026-10-13" },
    ];

    const plan = computeRenewalPlan([...thisWeek, ...future], "2026-10-05");

    expect(plan.anchor).toBe("2026-10-09");
    // Monday and Tuesday of next week already exist (the User added them by
    // hand), so their slots are skipped as duplicates; the rest is created.
    expect(plan.toCreate.map((item) => item.targetDate)).toEqual([
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
    ]);
    expect(plan.skipped.filter((e) => e.reason === "duplicate")).toHaveLength(2);
    // The future weeks the User already scheduled are not duplicated.
    const plannedKeys = plan.toCreate.map((item) =>
      renewalDishKey(item.offer.dishName, item.targetDate)
    );
    expect(plannedKeys).not.toContain(renewalDishKey("Zestaw", "2026-10-19"));
  });
});

describe("computeRenewalPlan: properties", () => {
  /** Concrete-date generator: Friday of the menu week, any renewable offset. */
  const fridayArbitrary = fc
    .integer({ min: -7, max: 6 })
    .map((offset) => addDaysISO("2026-10-05", offset + 4));

  const dishNamesArbitrary = fc
    .array(
      fc
        .string({ minLength: 2, maxLength: 40 })
        .filter((name) => name.trim().length > 0),
      { minLength: 1, maxLength: 8 }
    )
    .map((names) => Array.from(new Set(names.map((n) => n.trim()))).filter((n) => n.length > 0))
    .filter((names) => names.length > 0);

  it("P1: every target is today or later, and at most today + 13", () => {
    fc.assert(
      fc.property(
        fridayArbitrary,
        dishNamesArbitrary,
        fc.constantFrom("2026-10-05", "2026-10-07", "2026-10-11"),
        (friday, dishes, today) => {
          const offers = weekDishes(friday, dishes);
          const plan = computeRenewalPlan(offers, today);

          for (const item of plan.toCreate) {
            expect(item.targetDate >= today).toBe(true);
            expect(item.targetDate <= addDaysISO(today, 13)).toBe(true);
            // The mapping preserves the weekday exactly.
            const sourceWeekday = new Date(item.offer.availableDate + "T00:00:00").getDay();
            const targetWeekday = new Date(item.targetDate + "T00:00:00").getDay();
            expect(targetWeekday).toBe(sourceWeekday);
          }
        }
      )
    );
  });

  it("P2: no two created offers share the dish-and-date key", () => {
    fc.assert(
      fc.property(
        fridayArbitrary,
        dishNamesArbitrary,
        fc.constantFrom("2026-10-05", "2026-10-06", "2026-10-07"),
        (friday, dishes, today) => {
          const plan = computeRenewalPlan(weekDishes(friday, dishes), today);
          const keys = plan.toCreate.map((item) =>
            renewalDishKey(item.offer.dishName, item.targetDate)
          );
          expect(new Set(keys).size).toBe(keys.length);
        }
      )
    );
  });

  it("P3: every source is either created or skipped, exactly once", () => {
    fc.assert(
      fc.property(
        fridayArbitrary,
        dishNamesArbitrary,
        fc.constantFrom("2026-10-05", "2026-10-06", "2026-10-07", "2026-10-11"),
        (friday, dishes, today) => {
          const offers = weekDishes(friday, dishes);
          const plan = computeRenewalPlan(offers, today);
          const handled = plan.toCreate.length + plan.skipped.length;
          // Sources are the anchor-week slice of the input.
          const anchor = plan.anchor!;
          const windowStart = addDaysISO(anchor, -6);
          const sources = offers.filter(
            (offer) => offer.availableDate >= windowStart && offer.availableDate <= anchor
          );
          expect(handled).toBe(sources.length);
        }
      )
    );
  });

  it("P4: a target that already exists is never planned for creation", () => {
    fc.assert(
      fc.property(
        fridayArbitrary,
        dishNamesArbitrary,
        fc.constantFrom("2026-10-05", "2026-10-06", "2026-10-07"),
        (friday, dishes, today) => {
          const offers = weekDishes(friday, dishes);
          const first = computeRenewalPlan(offers, today);
          // Simulate the created rows existing, then plan again: everything
          // must now be reported as duplicates, nothing created twice.
          const existing = new Set(
            first.toCreate.map((item) => renewalDishKey(item.offer.dishName, item.targetDate))
          );
          const offersWithTargets: RenewalInputOffer[] = [
            ...offers,
            ...first.toCreate.map((item) => ({
              id: `created-${item.offer.id}`,
              dishName: item.offer.dishName,
              availableDate: item.targetDate,
            })),
          ];
          const second = computeRenewalPlan(offersWithTargets, today);
          const secondKeys = second.toCreate.map((item) =>
            renewalDishKey(item.offer.dishName, item.targetDate)
          );
          for (const key of secondKeys) {
            expect(existing.has(key)).toBe(false);
          }
        }
      )
    );
  });
});
