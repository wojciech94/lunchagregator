import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { countRestaurantLinkedOffers } from "./restaurants";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getUser: vi.fn() }));
const ID = "550e8400-e29b-41d4-a716-446655440000";
const OWNER = "11111111-1111-4111-8111-111111111111";
const offers = { select: vi.fn(), eq: vi.fn(), gte: vi.fn() };
const restaurant = { select: vi.fn(), eq: vi.fn(), single: vi.fn() };
const from = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUser).mockResolvedValue({ id: OWNER } as Awaited<
    ReturnType<typeof getUser>
  >);
  restaurant.select.mockReturnValue(restaurant);
  restaurant.eq.mockReturnValue(restaurant);
  restaurant.single.mockResolvedValue({
    data: { user_id: OWNER },
    error: null,
  });
  offers.select.mockReturnValue(offers);
  offers.eq.mockResolvedValue({ count: 12, error: null });
  from.mockImplementation((table) =>
    table === "restaurants" ? restaurant : offers,
  );
  vi.mocked(createClient).mockResolvedValue({ from } as unknown as Awaited<
    ReturnType<typeof createClient>
  >);
});

describe("count all linked offers", () => {
  it("counts without a date filter", async () => {
    expect(await countRestaurantLinkedOffers(ID)).toEqual({
      success: true,
      data: 12,
    });
    expect(offers.select).toHaveBeenCalledWith("id", {
      count: "exact",
      head: true,
    });
    expect(offers.eq).toHaveBeenCalledWith("restaurant_id", ID);
    expect(offers.gte).not.toHaveBeenCalled();
  });
  it("denies a different owner before counting", async () => {
    restaurant.single.mockResolvedValue({
      data: { user_id: "another-owner" },
      error: null,
    });
    expect(await countRestaurantLinkedOffers(ID)).toMatchObject({
      success: false,
    });
    expect(offers.select).not.toHaveBeenCalled();
  });
  it("allows an admin to count another owner’s offers", async () => {
    vi.mocked(getUser).mockResolvedValue({
      id: "admin-id",
      app_metadata: { role: "admin" },
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-10-07T00:00:00Z",
    });
    expect(await countRestaurantLinkedOffers(ID)).toEqual({
      success: true,
      data: 12,
    });
  });
  it("does not turn a database failure into zero", async () => {
    offers.eq.mockResolvedValue({ count: null, error: { message: "offline" } });
    expect(await countRestaurantLinkedOffers(ID)).toMatchObject({
      success: false,
    });
  });
  it("rejects guests without reading the database", async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    expect(await countRestaurantLinkedOffers(ID)).toMatchObject({
      success: false,
    });
    expect(createClient).not.toHaveBeenCalled();
  });
});
