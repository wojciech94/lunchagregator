import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { deleteRestaurant } from "./restaurants";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getUser: vi.fn() }));
const ID = "550e8400-e29b-41d4-a716-446655440000";
const OWNER = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.mocked(getUser).mockResolvedValue({ id: OWNER } as Awaited<
    ReturnType<typeof getUser>
  >);
});

describe("restaurant deletion and historical snapshots", () => {
  it.each([false, true])(
    "keeps the published snapshot even when deletion fails: %s",
    async (deleteFails) => {
      const snapshot = {
        restaurant_name: "Nazwa przy publikacji",
        restaurant_address: "Stary adres",
        restaurant_location: "POINT(21 52)",
      };
      const original = { ...snapshot };
      const restaurantQuery = {
        select: vi.fn(),
        eq: vi.fn(),
        single: vi.fn(),
        delete: vi.fn(),
      };
      restaurantQuery.select.mockReturnValue(restaurantQuery);
      restaurantQuery.eq.mockReturnValue(restaurantQuery);
      restaurantQuery.single.mockResolvedValue({
        data: {
          id: ID,
          user_id: OWNER,
          name: "Nowa nazwa",
          address: "Nowy adres",
          location: "POINT(22 53)",
        },
        error: null,
      });
      restaurantQuery.delete.mockReturnValue({
        eq: vi
          .fn()
          .mockResolvedValue({
            error: deleteFails ? { message: "delete refused" } : null,
          }),
      });
      const offersQuery = { select: vi.fn(), update: vi.fn() };
      offersQuery.select.mockReturnValue({
        eq: vi
          .fn()
          .mockResolvedValue({ data: [{ id: "offer-1" }], error: null }),
      });
      offersQuery.update.mockImplementation((patch) => ({
        eq: vi.fn(async () => {
          Object.assign(snapshot, patch);
          return { error: null };
        }),
      }));
      vi.mocked(createClient).mockResolvedValue({
        from: (table: string) =>
          table === "restaurants" ? restaurantQuery : offersQuery,
      } as unknown as Awaited<ReturnType<typeof createClient>>);

      expect(await deleteRestaurant(ID)).toMatchObject({
        success: !deleteFails,
      });
      expect(snapshot).toEqual(original);
    },
  );
});
