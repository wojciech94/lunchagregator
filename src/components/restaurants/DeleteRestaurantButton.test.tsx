/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  countRestaurantLinkedOffers,
  deleteRestaurant,
} from "@/actions/restaurants";
import { DeleteRestaurantButton } from "./DeleteRestaurantButton";

vi.mock("@/actions/restaurants", () => ({
  countRestaurantLinkedOffers: vi.fn(),
  deleteRestaurant: vi.fn(),
}));
const restaurant = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "Bar",
  address: null,
  hasOwner: true,
  activeOffersCount: 0,
};
afterEach(cleanup);
beforeEach(() => {
  vi.mocked(countRestaurantLinkedOffers).mockReset();
  vi.mocked(deleteRestaurant).mockReset();
});

describe("restaurant deletion consequences", () => {
  it("loads the total including expired offers and blocks deletion while loading", async () => {
    let resolve!: (result: { success: true; data: number }) => void;
    vi.mocked(countRestaurantLinkedOffers).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    vi.mocked(deleteRestaurant).mockResolvedValue({
      success: true,
      data: undefined,
    });
    render(<DeleteRestaurantButton restaurant={restaurant} />);
    fireEvent.click(screen.getByRole("button", { name: "Usuń" }));
    expect(
      screen.getByRole("button", { name: "Usuń restaurację" }),
    ).toBeDisabled();
    expect(deleteRestaurant).not.toHaveBeenCalled();
    resolve({ success: true, data: 12 });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Usuń restaurację" }),
      ).not.toBeDisabled(),
    );
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText(/Oferty nie zostaną usunięte/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Usuń restaurację" }));
    await waitFor(() =>
      expect(deleteRestaurant).toHaveBeenCalledWith(restaurant.id),
    );
  });

  it("keeps confirmation disabled after count failure and retries on reopen", async () => {
    vi.mocked(countRestaurantLinkedOffers)
      .mockResolvedValueOnce({
        success: false,
        error: "Nie udało się policzyć ofert.",
      })
      .mockResolvedValueOnce({ success: true, data: 0 });
    render(<DeleteRestaurantButton restaurant={restaurant} />);
    fireEvent.click(screen.getByRole("button", { name: "Usuń" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nie udało się");
    expect(
      screen.getByRole("button", { name: "Usuń restaurację" }),
    ).toBeDisabled();
    expect(deleteRestaurant).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    fireEvent.click(screen.getByRole("button", { name: "Usuń" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Usuń restaurację" }),
      ).not.toBeDisabled(),
    );
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
