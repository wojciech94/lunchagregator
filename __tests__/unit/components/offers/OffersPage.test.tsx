/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { PaginatedOffers } from "@/types/offers";

const mockGetOffers = vi.fn();
const mockRequestLocation = vi.fn();
const mockPush = vi.fn();
const mockReplace = vi.fn();

// The URL is the source of truth for filters, so the "some filters are set"
// signal comes from here rather than from component state. Rendering twice
// with different params is what a navigation actually does.
let currentSearch = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

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
vi.mock("@/components/location/AddressInput", () => ({
  AddressInput: () => null,
}));

// The real filter form drives its own state from the filters it is given, so
// it is replaced by a button for clicks plus a field for typing. The second
// one exercises the debounced search channel.
vi.mock("@/components/offers/OfferFilters", () => ({
  OfferFilters: ({
    onChange,
    onSearchChange,
  }: {
    onChange: (f: Record<string, unknown>) => void;
    onSearchChange?: (f: Record<string, unknown>) => void;
  }) => (
    <>
      <button onClick={() => onChange({ cuisineTypes: ["polska"] })}>apply filters</button>
      <button
        onClick={() => onSearchChange?.({ cuisineTypes: ["polska"] })}
      >
        type search
      </button>
    </>
  ),
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
    currentSearch = "";
    mockGetOffers.mockResolvedValue({
      success: true,
      data: emptyPage,
    });
  });

  it("explains that there is nothing today when no filters are set", () => {
    render(<OffersPage initialData={emptyPage} />);

    expect(
      screen.getByText(
        /Brak ofert lunchowych na .*\. Sprawdź inny dzień lub dodaj własną ofertę\./
      )
    ).toBeInTheDocument();
  });

  it("points at the filters once the URL carries some", () => {
    // This used to be driven by clicking a filter and waiting for a re-fetch.
    // Now the same thing happens by navigating, so the assertion is on what the
    // URL produces.
    currentSearch = "cuisines=polska";
    render(<OffersPage initialData={emptyPage} />);

    expect(
      screen.getByText(
        "Brak ofert spełniających wybrane kryteria. Spróbuj zmienić filtry."
      )
    ).toBeInTheDocument();
  });

  it("writes a filter change to the URL rather than fetching", async () => {
    render(<OffersPage initialData={emptyPage} />);

    fireEvent.click(screen.getByRole("button", { name: "apply filters" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/?cuisines=polska");
    });
    // push, not replace: a filter the User committed to should be undoable.
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe("a link that needs a location", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSearch = "";
    mockGetOffers.mockResolvedValue({ success: true, data: emptyPage });
  });

  it("says so rather than dropping the parameters", () => {
    currentSearch = "radius=5";
    render(<OffersPage initialData={emptyPage} />);

    expect(screen.getByTestId("distance-needs-location")).toBeInTheDocument();
    // Requirement 2.12: the URL is untouched, so re-sharing it still works.
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("does not render the list alongside the empty state", () => {
    render(<OffersPage initialData={emptyPage} />);

    expect(
      screen.queryByRole("list", { name: "Lista ofert lunchowych" })
    ).not.toBeInTheDocument();
  });
});

describe("a link that needs a location", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSearch = "";
    mockGetOffers.mockResolvedValue({ success: true, data: emptyPage });
  });

  it("says so when the link asks to sort by distance", () => {
    currentSearch = "sort=distance";
    render(<OffersPage initialData={emptyPage} />);

    expect(screen.getByTestId("distance-needs-location")).toBeInTheDocument();
  });

  it("says nothing when no distance filter was asked for", () => {
    currentSearch = "cuisines=polska";
    render(<OffersPage initialData={emptyPage} />);

    expect(screen.queryByTestId("distance-needs-location")).not.toBeInTheDocument();
  });
});
