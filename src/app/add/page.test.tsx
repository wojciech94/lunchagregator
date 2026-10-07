import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRestaurant } from "@/actions/restaurants";
import AddOfferPage from "./page";

vi.mock("@/actions/restaurants", () => ({ getRestaurant: vi.fn() }));
vi.mock("@/components/add-offer/AddOfferWizard", () => ({
  default: () => null,
}));
const ID = "550e8400-e29b-41d4-a716-446655440000";
beforeEach(() => {
  vi.mocked(getRestaurant).mockReset();
});

describe("add page restaurant context", () => {
  it("passes only the server-resolved restaurant to the wizard", async () => {
    vi.mocked(getRestaurant).mockResolvedValue({
      id: ID,
      name: "Bar",
      address: "Wrocław",
    } as Awaited<ReturnType<typeof getRestaurant>>);
    const page = await AddOfferPage({
      searchParams: Promise.resolve({ restaurantId: ID }),
    });
    expect(getRestaurant).toHaveBeenCalledWith(ID);
    expect(page.props.initialRestaurant).toEqual({
      id: ID,
      name: "Bar",
      address: "Wrocław",
    });
  });
  it.each(["bad-id", [ID, ID]])(
    "does not query invalid or repeated identifiers",
    async (restaurantId) => {
      const page = await AddOfferPage({
        searchParams: Promise.resolve({ restaurantId }),
      });
      expect(getRestaurant).not.toHaveBeenCalled();
      expect(page.props.initialRestaurant).toBeNull();
      expect(page.props.restaurantError).toMatch(/Nieprawidłowy/);
    },
  );
  it("handles a removed restaurant and permits normal assignment", async () => {
    vi.mocked(getRestaurant).mockResolvedValue(null);
    const page = await AddOfferPage({
      searchParams: Promise.resolve({ restaurantId: ID }),
    });
    expect(page.props.initialRestaurant).toBeNull();
    expect(page.props.restaurantError).toMatch(/Nie znaleziono/);
  });
  it("shows an actionable message after a read failure", async () => {
    vi.mocked(getRestaurant).mockRejectedValue(new Error("offline"));
    const page = await AddOfferPage({
      searchParams: Promise.resolve({ restaurantId: ID }),
    });
    expect(page.props.restaurantError).toMatch(/Nie udało się odczytać/);
  });
});
