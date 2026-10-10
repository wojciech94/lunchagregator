/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OfferCard, truncateDescription } from "@/components/offers/OfferCard";
import type { LunchOfferWithDistance } from "@/types/offers";

function createMockOffer(
  overrides: Partial<LunchOfferWithDistance> = {}
): LunchOfferWithDistance {
  return {
    id: "test-id-1",
    dishName: "Pierogi ruskie",
    items: [],
    price: 24.99,
    currency: "PLN",
    description: "Tradycyjne pierogi z serem i ziemniakami",
    restaurantName: "Restauracja Polska",
    restaurantAddress: "ul. Marszałkowska 1, Warszawa",
    restaurantLocation: { latitude: 52.2297, longitude: 21.0122 },
    availableDate: "2024-01-15",
    cuisineType: "polska",
    dietaryTags: ["vegetarian"],
    allergens: ["gluten", "mleko"],
    sourceType: "text",
    userId: null,
    sessionToken: "session-123",
    createdAt: "2024-01-15T10:00:00Z",
    updatedAt: "2024-01-15T10:00:00Z",
    distanceKm: 1.2,
    ...overrides,
  };
}

describe("truncateDescription", () => {
  it("returns null for null description", () => {
    expect(truncateDescription(null)).toBeNull();
  });

  it("returns the full description when under 150 characters", () => {
    const short = "Short description";
    expect(truncateDescription(short)).toBe(short);
  });

  it("returns the full description when exactly 150 characters", () => {
    const exact = "a".repeat(150);
    expect(truncateDescription(exact)).toBe(exact);
  });

  it("truncates and adds ellipsis when over 150 characters", () => {
    const long = "a".repeat(200);
    const result = truncateDescription(long);
    expect(result).toBe("a".repeat(150) + "...");
    expect(result!.length).toBe(153);
  });

  it("respects custom maxLength parameter", () => {
    const text = "Hello World";
    expect(truncateDescription(text, 5)).toBe("Hello...");
  });
});

describe("OfferCard", () => {
  it("renders dish name, restaurant name, and price", () => {
    const offer = createMockOffer();
    render(<OfferCard offer={offer} />);

    expect(screen.getByText("Pierogi ruskie")).toBeInTheDocument();
    expect(screen.getByText("Restauracja Polska")).toBeInTheDocument();
    expect(screen.getByText(/24,99\s*zł/)).toBeInTheDocument();
  });

  it("renders description when available", () => {
    const offer = createMockOffer({
      description: "Tradycyjne pierogi z serem i ziemniakami",
    });
    render(<OfferCard offer={offer} />);

    expect(
      screen.getByText("Tradycyjne pierogi z serem i ziemniakami")
    ).toBeInTheDocument();
  });

  it("does not render description when null", () => {
    const offer = createMockOffer({ description: null });
    render(<OfferCard offer={offer} />);

    // Only dish name, restaurant name, and price should be present
    expect(screen.getByText("Pierogi ruskie")).toBeInTheDocument();
    expect(screen.queryByText(/Tradycyjne/)).not.toBeInTheDocument();
  });

  it("truncates long descriptions with ellipsis", () => {
    const longDesc = "a".repeat(200);
    const offer = createMockOffer({ description: longDesc });
    render(<OfferCard offer={offer} />);

    expect(screen.getByText("a".repeat(150) + "...")).toBeInTheDocument();
  });

  it("renders distance when available", () => {
    const offer = createMockOffer({ distanceKm: 2.5 });
    render(<OfferCard offer={offer} />);

    expect(screen.getByText("2,5 km")).toBeInTheDocument();
  });

  it("hides distance when null", () => {
    const offer = createMockOffer({ distanceKm: null });
    render(<OfferCard offer={offer} />);

    expect(screen.queryByText(/km/)).not.toBeInTheDocument();
  });

  it("links to the offer detail page", () => {
    const offer = createMockOffer({ id: "offer-abc" });
    render(<OfferCard offer={offer} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/offers/offer-abc");
  });

  it("has accessible label with dish name, restaurant, and price", () => {
    const offer = createMockOffer();
    render(<OfferCard offer={offer} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "aria-label",
      "Pierogi ruskie - Restauracja Polska, 24.99 PLN"
    );
  });
});
