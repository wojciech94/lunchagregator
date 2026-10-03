/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { PaginatedOffers } from "@/types/offers";

const mockGetOffers = vi.fn();
const mockRequestLocation = vi.fn();

vi.mock("@/actions/offers", () => ({
  getOffers: (...args: unknown[]) => mockGetOffers(...args),
}));

// The real hook would ask the browser for a location and persist whatever it
// got, which is not what these tests are about.
vi.mock("@/hooks/useGeolocation", () => ({
  useGeolocation: () => ({
    coordinates: null,
    error: null,
    loading: false,
    permissionState: null,
    requestLocation: mockRequestLocation,
    setManualCoordinates: vi.fn(),
  }),
}));

// Replaced with a single button so a filter change can be driven without
// reproducing the whole filter form.
vi.mock("@/components/offers/OfferFilters", () => ({
  OfferFilters: ({ onChange }: { onChange: (f: Record<string, unknown>) => void }) => (
    <button onClick={() => onChange({ cuisineTypes: ["polska"] })}>apply filters</button>
  ),
}));

vi.mock("@/components/location/AddressInput", () => ({
  AddressInput: () => null,
}));

import { OffersPage } from "@/components/offers/OffersPage";

const emptyPage: PaginatedOffers = {
  offers: [],
  total: 0,
  page: 1,
  limit: 50,
  hasMore: false,
};

describe("OffersPage empty state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOffers.mockResolvedValue({
      success: true,
      data: emptyPage,
    });
  });

  it("explains that there is nothing today when no filters are set", () => {
    render(<OffersPage initialData={emptyPage} />);

    expect(
      screen.getByText(
        "Brak ofert lunchowych na dziś. Sprawdź później lub dodaj własną ofertę!"
      )
    ).toBeInTheDocument();
  });

  it("points at the filters once some are set", async () => {
    render(<OffersPage initialData={emptyPage} />);

    fireEvent.click(screen.getByRole("button", { name: "apply filters" }));

    // Applying filters re-fetches, so the message only settles once the
    // in-flight request has cleared the loading flag.
    await waitFor(() => {
      expect(
        screen.getByText(
          "Brak ofert spełniających wybrane kryteria. Spróbuj zmienić filtry."
        )
      ).toBeInTheDocument();
    });
  });

  it("does not render the list alongside the empty state", () => {
    render(<OffersPage initialData={emptyPage} />);

    expect(
      screen.queryByRole("list", { name: "Lista ofert lunchowych" })
    ).not.toBeInTheDocument();
  });
});