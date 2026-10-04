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

vi.mock('@/actions/offers', () => ({
  getOffers: (...args: unknown[]) => mockGetOffers(...args),
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
});

describe('the home page asks for an unsorted day', () => {
  it('sends no sortBy, so the server applies the alphabetical fallback', async () => {
    await Home();

    expect(mockGetOffers).toHaveBeenCalledTimes(1);
    const sent = mockGetOffers.mock.calls[0][0];
    expect(sent).toEqual({});
    // Sending "newest" here is what put the first paint in the wrong order for
    // every visitor whose location had not resolved.
    expect('sortBy' in sent).toBe(false);
  });

  it('does not pass a limit of its own', async () => {
    await Home();

    // The fallback object said 20 while the service returns 50, so a failed SSR
    // pass produced a page whose pagination disagreed with the query behind it.
    expect('limit' in mockGetOffers.mock.calls[0][0]).toBe(false);
  });
});

describe('the home page fallback', () => {
  it('reports the service default page size when the fetch fails', async () => {
    mockGetOffers.mockResolvedValue({ success: false, error: 'Failed to fetch offers' });

    render(await Home());

    // get_offers_filtered defaults to 50 and OfferFilters defaults to 50. A
    // fallback of 20 made the empty state look like a genuinely short page.
    expect(screen.getByTestId('offers-page').getAttribute('data-limit')).toBe('50');
  });

  it('still renders when the fetch fails', async () => {
    mockGetOffers.mockResolvedValue({ success: false, error: 'boom' });

    render(await Home());

    expect(screen.getByTestId('offers-page').getAttribute('data-offers')).toBe('0');
  });
});