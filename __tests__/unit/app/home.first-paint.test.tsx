/**
 * @vitest-environment jsdom
 */
// Requirement 1.2 on first paint.
//
// `app/page.tsx` renders the offer list server-side, before any geolocation has
// been asked for. It used to pass `sortBy: "newest"`, so the list a visitor
// arrived at was newest-first -- and `listOffers` only applies the alphabetical
// fallback when no sortBy was requested. SSR is the first paint, so the
// requirement was violated on arrival rather than after a fetch corrected it.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockGetOffers = vi.fn();
const mockReadLocation = vi.fn();

vi.mock('@/actions/offers', () => ({
  getOffers: (...args: unknown[]) => mockGetOffers(...args),
}));

vi.mock('@/lib/location', () => ({
  readStoredLocationCookie: () => mockReadLocation(),
}));

vi.mock('@/components/offers/OffersPage', () => ({
  OffersPage: ({
    initialData,
  }: {
    initialData: { limit: number; offers: unknown[] };
  }) => (
    <div
      data-testid="offers-page"
      data-limit={String(initialData.limit)}
      data-offers={initialData.offers.length}
    />
  ),
}));

import Home from '@/app/page';

function ok(overrides: Record<string, unknown> = {}) {
  return {
    success: true as const,
    data: { offers: [], total: 0, page: 1, limit: 50, hasMore: false, ...overrides },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOffers.mockResolvedValue(ok());
  mockReadLocation.mockResolvedValue(null);
});

/** `searchParams` arrives as a promise, as Next.js delivers it. */
function renderHome(params: Record<string, string | string[]> = {}) {
  return Home({ searchParams: Promise.resolve(params) });
}

describe('the home page asks for an unsorted day', () => {
  it('sends no sortBy, so the server applies the alphabetical fallback', async () => {
    await renderHome();

    expect(mockGetOffers).toHaveBeenCalledTimes(1);
    const sent = mockGetOffers.mock.calls[0][0];
    expect(sent).toEqual({});
    // Sending "newest" here is what put the first paint in the wrong order for
    // every visitor whose location had not resolved.
    expect('sortBy' in sent).toBe(false);
  });

  it('does not pass a limit of its own', async () => {
    await renderHome();

    // The fallback object said 20 while the service returns 50, so a failed SSR
    // pass produced a page whose pagination disagreed with the query behind it.
    expect('limit' in mockGetOffers.mock.calls[0][0]).toBe(false);
  });
});

describe('the home page fallback', () => {
  it('reports the service default page size when the fetch fails', async () => {
    mockGetOffers.mockResolvedValue({ success: false, error: 'Failed to fetch offers' });

    render(await renderHome());

    // get_offers_filtered defaults to 50 and OfferFilters defaults to 50. A
    // fallback of 20 made the empty state look like a genuinely short page.
    expect(screen.getByTestId('offers-page').getAttribute('data-limit')).toBe('50');
  });

  it('still renders when the fetch fails', async () => {
    mockGetOffers.mockResolvedValue({ success: false, error: 'boom' });

    render(await renderHome());

    expect(screen.getByTestId('offers-page').getAttribute('data-offers')).toBe('0');
  });
});

// Requirement 2.9: the URL is what the server renders from, so a shared link
// shows the same list to the person it was sent to.
describe('the home page renders from the URL', () => {
  it('passes filters through to the query', async () => {
    await renderHome({ sort: 'price_asc', priceMin: '10', priceMax: '40' });

    expect(mockGetOffers.mock.calls[0][0]).toMatchObject({
      sortBy: 'price_asc',
      price: { min: 10, max: 40 },
    });
  });

  it('accepts repeated and comma-joined list parameters', async () => {
    await renderHome({ cuisines: ['polska,wloska'] });
    expect(mockGetOffers.mock.calls[0][0]).toMatchObject({
      cuisineTypes: ['polska', 'wloska'],
    });

    vi.clearAllMocks();
    mockGetOffers.mockResolvedValue(ok());

    await renderHome({ diets: ['vegan', 'gluten-free'] });
    expect(mockGetOffers.mock.calls[0][0]).toMatchObject({
      dietaryTags: ['vegan', 'gluten-free'],
    });
  });

  it('ignores a value it cannot parse rather than failing the render', async () => {
    await renderHome({ radius: 'ogromna', priceMin: 'abc' });

    // The schema rejects the whole object when one field is bad, so nothing is
    // applied. A hand-edited link still shows offers.
    expect(mockGetOffers).toHaveBeenCalledTimes(1);
    expect(mockGetOffers.mock.calls[0][0]).toEqual({});
  });

  it('never sends a limit of its own, whatever the URL says', async () => {
    await renderHome({ limit: '10' });

    // limit is not User-chosen state (Requirement 2.9), so it is not read back
    // from the URL either -- the service default is what applies.
    expect('limit' in mockGetOffers.mock.calls[0][0]).toBe(false);
  });
});

// Requirement 1.1 on the first paint: distance sorting needs the location, and
// for the first time the server can see it.
describe('the home page reads the location from the cookie', () => {
  it('sends coordinates so the first paint can sort by distance', async () => {
    mockReadLocation.mockResolvedValue({
      coordinates: { latitude: 52.2297, longitude: 21.0122 },
      label: 'x',
      source: 'geolocation',
      savedAt: 1,
    });

    await renderHome({ sort: 'distance' });

    expect(mockGetOffers).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'distance' }),
      { latitude: 52.2297, longitude: 21.0122 }
    );
  });

  it('sends no coordinates when the cookie is absent', async () => {
    mockReadLocation.mockResolvedValue(null);

    await renderHome();

    expect(mockGetOffers.mock.calls[0][1]).toBeUndefined();
  });
});