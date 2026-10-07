/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Home from "./page";

vi.mock("@/actions/offers", () => ({ getOffers: vi.fn(async () => ({ success: true, data: { offers: [], total: 0, page: 1, limit: 50, hasMore: false } })) }));
vi.mock("@/lib/location", () => ({ readStoredLocationCookie: async () => null }));
vi.mock("@/components/offers/OffersPage", () => ({ OffersPage: () => null }));
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("selected-day home heading", () => {
  it.each([[undefined, "Oferty lunchowe na 6 października 2026"], ["2026-10-07", "Oferty lunchowe na 7 października 2026"], ["2026-10-20", "Oferty lunchowe na 20 października 2026"]])("describes %s", async (date, heading) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 6, 12));
    render(await Home({ searchParams: Promise.resolve({ date }) }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(heading);
  });
  it("uses the selected calendar date across the visitor/server midnight boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T22:30:00Z"));
    render(await Home({ searchParams: Promise.resolve({ date: "2026-10-07" }) }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Oferty lunchowe na 7 października 2026");
  });
});
