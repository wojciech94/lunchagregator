/**
 * @vitest-environment jsdom
 */
// #21: the offer list has one sort, and it is the server's.
//
// One list previously carried three of them: `order()` in the standard Postgres
// path, a JS sort in listOffersWithDistance, and a JS sort here. Two were wrong.
// The one in this component could only ever rearrange an already-sorted page --
// it ran over the 50 rows the server returned, so a re-sort could not reach rows
// the server had not sent.
//
// It also rewrote distanceKm to null whenever the browser had no location, twice:
// once in fetchOffers and again in a `displayOffers` memo. OfferCard renders
// nothing for a null distance already, so the mutation bought nothing and threw
// away real distances for offers that could be located.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { LunchOfferWithDistance, PaginatedOffers } from '@/types/offers';

const mockGetOffers = vi.fn();
let geoCoordinates: { latitude: number; longitude: number } | null = null;

vi.mock('@/actions/offers', () => ({
  getOffers: (...args: unknown[]) => mockGetOffers(...args),
}));

vi.mock('@/hooks/useGeolocation', () => ({
  useGeolocation: () => ({
    coordinates: geoCoordinates,
    error: null,
    loading: false,
    permissionState: null,
    requestLocation: vi.fn(),
    setManualCoordinates: vi.fn(),
  }),
}));

// Captures what OffersPage asks the filters to start on, so the default sort can
// be asserted without reproducing the whole filter form.
let observedInitialFilters: Record<string, unknown> = {};
vi.mock('@/components/offers/OfferFilters', () => ({
  OfferFilters: ({
    initialFilters,
  }: {
    initialFilters?: Record<string, unknown>;
  }) => {
    observedInitialFilters = initialFilters ?? {};
    return <div>filters</div>;
  },
}));

vi.mock('@/components/location/AddressInput', () => ({ AddressInput: () => null }));

// Renders the props it is given, so the assertions are about what OffersPage
// passed down rather than about OfferCard's markup.
vi.mock('@/components/offers/OfferList', () => ({
  OfferList: ({ offers }: { offers: LunchOfferWithDistance[] }) => (
    <ul>
      {offers.map((o) => (
        <li key={o.id} data-testid="offer" data-distance={String(o.distanceKm)}>
          {o.restaurantName}
        </li>
      ))}
    </ul>
  ),
}));

import { OffersPage } from '@/components/offers/OffersPage';

function offer(overrides: Partial<LunchOfferWithDistance> = {}): LunchOfferWithDistance {
  return {
    id: 'o1',
    dishName: 'Kotlet',
    items: [],
    price: 25,
    currency: 'PLN',
    description: null,
    restaurantName: 'Bar Mleko',
    restaurantAddress: 'Warszawa',
    restaurantLocation: null,
    availableDate: new Date().toISOString().slice(0, 10),
    cuisineType: null,
    dietaryTags: [],
    allergens: [],
    sourceType: 'text',
    userId: null,
    sessionToken: '',
    createdAt: '',
    updatedAt: '',
    distanceKm: null,
    ...overrides,
  };
}

function page(offers: LunchOfferWithDistance[]): PaginatedOffers {
  return { offers, total: offers.length, page: 1, limit: 50, hasMore: false };
}

/** Distances as rendered, so a rewrite to null is visible in the output. */
function renderedDistances(): (number | null)[] {
  return screen
    .getAllByTestId('offer')
    .map((el) => {
      const raw = el.getAttribute('data-distance');
      return raw === null || raw === 'null' ? null : Number(raw);
    });
}

beforeEach(() => {
  vi.clearAllMocks();
  geoCoordinates = null;
  observedInitialFilters = {};
});

describe('OffersPage does not reorder what the server sent', () => {
  it('renders the rows in the order they arrived', async () => {
    // Deliberately not alphabetical and not by distance: this is the order the
    // database produced, and the component used to re-sort it into one of its
    // own two schemes.
    const initial = page([
      offer({ id: 'a', restaurantName: 'Zen', distanceKm: 3 }),
      offer({ id: 'b', restaurantName: 'Alpha', distanceKm: 1 }),
      offer({ id: 'c', restaurantName: 'Midd', distanceKm: 2 }),
    ]);
    mockGetOffers.mockResolvedValue({ success: true, data: initial });

    render(<OffersPage initialData={initial} />);

    await waitFor(() => expect(screen.getAllByTestId('offer')).toHaveLength(3));
    expect(screen.getAllByTestId('offer').map((el) => el.textContent)).toEqual([
      'Zen',
      'Alpha',
      'Midd',
    ]);
    expect(renderedDistances()).toEqual([3, 1, 2]);
  });

  it('keeps a real distance for a locatable offer when the browser has none', async () => {
    // The mutation blanked distanceKm whenever `coordinates` was null -- which is
    // true on first paint, before geolocation resolves, and permanently for
    // anyone who declines it. An offer the server *could* place kept its
    // coordinates in the row and lost them on screen for no gain: OfferCard
    // already renders nothing for null.
    const initial = page([offer({ id: 'a', distanceKm: 2.5 })]);
    mockGetOffers.mockResolvedValue({ success: true, data: initial });

    render(<OffersPage initialData={initial} />);

    await waitFor(() => expect(screen.getAllByTestId('offer')).toHaveLength(1));
    expect(renderedDistances()).toEqual([2.5]);
  });

  it('still passes through a null distance untouched', async () => {
    const initial = page([offer({ id: 'a', distanceKm: null }), offer({ id: 'b', distanceKm: 4 })]);
    mockGetOffers.mockResolvedValue({ success: true, data: initial });

    render(<OffersPage initialData={initial} />);

    await waitFor(() => expect(screen.getAllByTestId('offer')).toHaveLength(2));
    expect(renderedDistances()).toEqual([null, 4]);
  });
});

describe('OffersPage default sort, Requirement 1.2', () => {
  it('leaves the sort unset when there is no location', () => {
    // With no origin the list is alphabetical by restaurant name, and that is
    // what `listOffers` only does when no sortBy was asked for. Asking for
    // "newest" here put the first paint in the wrong order for every visitor
    // whose location had not resolved.
    render(<OffersPage initialData={page([])} />);

    expect(observedInitialFilters).toEqual({});
    expect('sortBy' in observedInitialFilters).toBe(false);
  });

  it('keeps location-aware default sorting implicit once coordinates arrive', () => {
    geoCoordinates = { latitude: 52.2297, longitude: 21.0122 };

    render(<OffersPage initialData={page([])} />);

    // The service already uses the origin for default distance sorting. An
    // explicit value here would turn a default into a user-selected criterion.
    expect(observedInitialFilters).toEqual({});
  });
});
