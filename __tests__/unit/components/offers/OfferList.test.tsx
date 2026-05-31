/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OfferList } from "@/components/offers/OfferList";
import type { LunchOfferWithDistance } from "@/types/offers";

function createMockOffer(
  id: string,
  overrides: Partial<LunchOfferWithDistance> = {}
): LunchOfferWithDistance {
  return {
    id,
    dishName: `Dish ${id}`,
    items: [],
    price: 20.0,
    currency: "PLN",
    description: "A tasty dish",
    restaurantName: `Restaurant ${id}`,
    restaurantAddress: "ul. Testowa 1",
    restaurantLocation: { latitude: 52.23, longitude: 21.01 },
    availableDate: "2024-01-15",
    cuisineType: "polska",
    dietaryTags: [],
    allergens: [],
    sourceType: "text",
    userId: null,
    sessionToken: "session-123",
    createdAt: "2024-01-15T10:00:00Z",
    updatedAt: "2024-01-15T10:00:00Z",
    distanceKm: 1.0,
    ...overrides,
  };
}

describe("OfferList", () => {
  it("displays empty state message when no offers", () => {
    render(
      <OfferList
        offers={[]}
        pagination={{ total: 0, page: 1, limit: 20, hasMore: false }}
      />
    );

    expect(
      screen.getByText(
        "Brak ofert lunchowych na dziś. Sprawdź później lub dodaj własną ofertę!"
      )
    ).toBeInTheDocument();
  });

  it("renders offer cards when offers are provided", () => {
    const offers = [createMockOffer("1"), createMockOffer("2")];
    render(
      <OfferList
        offers={offers}
        pagination={{ total: 2, page: 1, limit: 20, hasMore: false }}
      />
    );

    expect(screen.getByText("Dish 1")).toBeInTheDocument();
    expect(screen.getByText("Dish 2")).toBeInTheDocument();
  });

  it("does not show pagination when on page 1 with no more pages", () => {
    const offers = [createMockOffer("1")];
    render(
      <OfferList
        offers={offers}
        pagination={{ total: 1, page: 1, limit: 20, hasMore: false }}
      />
    );

    expect(
      screen.queryByRole("navigation", { name: "Paginacja" })
    ).not.toBeInTheDocument();
  });

  it("shows pagination when hasMore is true", () => {
    const offers = [createMockOffer("1")];
    render(
      <OfferList
        offers={offers}
        pagination={{ total: 40, page: 1, limit: 20, hasMore: true }}
      />
    );

    expect(
      screen.getByRole("navigation", { name: "Paginacja" })
    ).toBeInTheDocument();
    expect(screen.getByText("Strona 1")).toBeInTheDocument();
  });

  it("shows pagination when page > 1", () => {
    const offers = [createMockOffer("1")];
    render(
      <OfferList
        offers={offers}
        pagination={{ total: 40, page: 2, limit: 20, hasMore: false }}
      />
    );

    expect(
      screen.getByRole("navigation", { name: "Paginacja" })
    ).toBeInTheDocument();
    expect(screen.getByText("Strona 2")).toBeInTheDocument();
  });

  it("disables previous button on page 1", () => {
    const offers = [createMockOffer("1")];
    render(
      <OfferList
        offers={offers}
        pagination={{ total: 40, page: 1, limit: 20, hasMore: true }}
      />
    );

    const prevButton = screen.getByRole("button", {
      name: "Poprzednia strona",
    });
    expect(prevButton).toBeDisabled();
  });

  it("disables next button when hasMore is false", () => {
    const offers = [createMockOffer("1")];
    render(
      <OfferList
        offers={offers}
        pagination={{ total: 40, page: 2, limit: 20, hasMore: false }}
      />
    );

    const nextButton = screen.getByRole("button", { name: "Następna strona" });
    expect(nextButton).toBeDisabled();
  });

  it("calls onPageChange with next page when next is clicked", () => {
    const onPageChange = vi.fn();
    const offers = [createMockOffer("1")];
    render(
      <OfferList
        offers={offers}
        pagination={{ total: 40, page: 1, limit: 20, hasMore: true }}
        onPageChange={onPageChange}
      />
    );

    const nextButton = screen.getByRole("button", { name: "Następna strona" });
    fireEvent.click(nextButton);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("calls onPageChange with previous page when previous is clicked", () => {
    const onPageChange = vi.fn();
    const offers = [createMockOffer("1")];
    render(
      <OfferList
        offers={offers}
        pagination={{ total: 40, page: 3, limit: 20, hasMore: true }}
        onPageChange={onPageChange}
      />
    );

    const prevButton = screen.getByRole("button", {
      name: "Poprzednia strona",
    });
    fireEvent.click(prevButton);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("renders a list with proper ARIA roles", () => {
    const offers = [createMockOffer("1"), createMockOffer("2")];
    render(
      <OfferList
        offers={offers}
        pagination={{ total: 2, page: 1, limit: 20, hasMore: false }}
      />
    );

    expect(
      screen.getByRole("list", { name: "Lista ofert lunchowych" })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
