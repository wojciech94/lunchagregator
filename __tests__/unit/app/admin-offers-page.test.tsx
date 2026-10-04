/**
 * @vitest-environment jsdom
 */
/**
 * The admin panel page. #55.
 *
 * What is worth testing here is the difference between the three things the page
 * can show. An empty list and a failed query look identical from the outside --
 * both render a panel with no rows in it -- and conflating them is the failure
 * that matters: an operator told "nothing to reclaim" when the database is
 * unreachable stops checking, and the orphans stay up.
 *
 * `notFound()` is mocked to throw, which is what Next.js does. A page that called
 * it and then carried on rendering would pass a test that only asserted on
 * `notFound` having been called, so the throw is what makes the assertion real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockGetAdmin = vi.fn();
const mockListAdminOffers = vi.fn();
const mockNotFound = vi.fn();

vi.mock('@/lib/auth', () => ({ getAdmin: () => mockGetAdmin() }));
vi.mock('@/actions/admin', () => ({
  listAdminOffers: () => mockListAdminOffers(),
}));
vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
  // The delete dialog is a client component inside every row, and it asks for a
  // router. The panel itself never navigates -- it refreshes in place -- so these
  // are only here to satisfy the render.
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

import AdminOffersPage from '@/app/admin/offers/page';

const ADMIN = { id: '11111111-1111-1111-1111-111111111111' };

function orphan(overrides: Record<string, unknown> = {}) {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    dishName: 'Rosół',
    items: [],
    price: 18.5,
    currency: 'PLN',
    description: null,
    restaurantName: 'Bar Stary',
    restaurantAddress: 'Marszałkowska 1',
    restaurantLocation: { latitude: 52.23, longitude: 21.01 },
    availableDate: '2026-10-04',
    cuisineType: 'polska',
    dietaryTags: [],
    allergens: [],
    sourceType: 'text',
    userId: null,
    sessionToken: 'tok',
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
    ...overrides,
  };
}


/** The page takes the query string as Next.js delivers it. */
function renderPage(searchParams: Record<string, string | string[]> = { orphan: '1' }) {
  return AdminOffersPage({ searchParams: Promise.resolve(searchParams) });
}
beforeEach(() => {
  vi.clearAllMocks();
  mockGetAdmin.mockResolvedValue(ADMIN);
});

describe('a non-admin', () => {
  it('gets a 404 rather than the panel', async () => {
    mockGetAdmin.mockResolvedValue(null);
    mockNotFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND');
    });

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('and the query is never reached, so nothing leaks through a late render', async () => {
    mockGetAdmin.mockResolvedValue(null);
    mockNotFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND');
    });

    await expect(renderPage()).rejects.toThrow();
    // Not merely an empty result: a fetch below the guard would put the panel's
    // data one refactor away from anybody who can reach the route.
    expect(mockListAdminOffers).not.toHaveBeenCalled();
  });
});

describe('an admin', () => {
  it('sees each ownerless offer, with the restaurant and the address', async () => {
    mockListAdminOffers.mockResolvedValue({
      rows: [
        orphan(),
        orphan({ id: '44444444-4444-4444-4444-444444444444', dishName: 'Kotlet schabowy' }),
      ],
      total: 2,
    });

    render(await renderPage());

    expect(screen.getByText('Rosół')).toBeInTheDocument();
    expect(screen.getByText('Kotlet schabowy')).toBeInTheDocument();
    // Two rows from the same restaurant here, so this is the count rather than a
    // single match -- and the count is the point: one row must not stand in for
    // another.
    expect(screen.getAllByText('Bar Stary')).toHaveLength(2);
    expect(screen.getAllByText('Marszałkowska 1')).toHaveLength(2);
  });

  it('is offered the edit and delete actions for each one', async () => {
    const id = '33333333-3333-3333-3333-333333333333';
    mockListAdminOffers.mockResolvedValue({ rows: [orphan({ id })], total: 1 });

    render(await renderPage());

    // The controls are what make the panel usable, and their absence would leave a
    // list an operator can read and not act on -- the exact state #54 created.
    expect(screen.getByRole('link', { name: /edytuj/i })).toHaveAttribute(
      'href',
      `/offers/${id}/edit`
    );
    // Deleting is a dialog in place, so there is no delete link to point at. A
    // navigation away here would be the regression: it is what put the operator
    // on the public offer list after every deletion.
    expect(screen.getByRole('button', { name: /^usuń$/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^usuń$/i })).not.toBeInTheDocument();
  });

  it('sees an offer with an address but no coordinates flagged', async () => {
    // #17/#18 made this the common case, and it is the one worth fixing from this
    // page -- so it cannot render as an ordinary row.
    mockListAdminOffers.mockResolvedValue({ rows: [orphan({ restaurantLocation: null })], total: 1 });

    render(await renderPage());

    expect(screen.getByText(/brak współrzędnych/i)).toBeInTheDocument();
  });

  it('does not flag coordinates on an offer that has them', async () => {
    mockListAdminOffers.mockResolvedValue({ rows: [orphan()], total: 1 });

    render(await renderPage());

    expect(screen.queryByText(/brak współrzędnych/i)).not.toBeInTheDocument();
  });

  it('says so plainly when an offer has no address at all', async () => {
    mockListAdminOffers.mockResolvedValue({ rows: [orphan({ restaurantAddress: null })], total: 1 });

    render(await renderPage());

    // Distinct from "no coordinates": one is a datum to fill in, the other means
    // the offer cannot be placed on a map at all.
    expect(screen.getByText(/brak adresu/i)).toBeInTheDocument();
    expect(screen.queryByText(/brak współrzędnych/i)).not.toBeInTheDocument();
  });

  it('sees an empty list described as empty, not as a failure', async () => {
    mockListAdminOffers.mockResolvedValue({ rows: [], total: 1 });

    render(await renderPage());

    expect(screen.getByText(/nie ma ofert bez właściciela/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it('sees a failure as a failure, and never as an empty list', async () => {
    mockListAdminOffers.mockResolvedValue({ rows: null, total: 0, error: 'boom' });

    render(await renderPage());

    expect(screen.getByRole('alert')).toHaveTextContent(/nie udało się pobrać/i);
    // The dangerous half: "nothing to reclaim" must not appear when the query
    // failed, or the operator concludes the table is clean.
    expect(screen.queryByText(/nie ma ofert bez właściciela/i)).not.toBeInTheDocument();
  });

  it('counts the rows rather than saying "some"', async () => {
    mockListAdminOffers.mockResolvedValue({ rows: [orphan(), orphan({ id: '44444444-4444-4444-4444-444444444444' })], total: 1 });

    render(await renderPage());

    expect(screen.getByText('2 ofert')).toBeInTheDocument();
  });
});
