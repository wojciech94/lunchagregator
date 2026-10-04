/**
 * @vitest-environment jsdom
 */
/**
 * The edit page, and the `forbidden` state it never entered.
 *
 * The page declared `{ status: "forbidden" }`, rendered a message for it, and
 * never set it -- `grep -n forbidden src/app` found the type and the JSX and no
 * assignment. So the URL was open to anybody: you got the form, you filled it in,
 * and the server action refused you on submit. Authorisation was never actually
 * missing, it lived in `updateOfferAction` where it belongs; what was missing was
 * telling the reader before they typed.
 *
 * The page is a client component, so it cannot ask who is asking -- `getUser()`
 * reads `next/headers` and importing it here fails the production build. The
 * answer arrives as `canModify` on `getOfferWithAccessAction`, and
 * `offer-access.test.ts` covers how that is decided. What is left to pin down here
 * is that the page obeys the flag it is handed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import EditOfferPage from '@/app/offers/[id]/edit/page';

const OFFER_ID = '33333333-3333-3333-3333-333333333333';

const mockGetOfferWithAccessAction = vi.fn();

vi.mock('@/actions/offers', () => ({
  getOfferWithAccessAction: (...args: unknown[]) => mockGetOfferWithAccessAction(...args),
  deleteOfferAction: vi.fn(),
  updateOfferAction: vi.fn(),
}));

function offer(userId: string | null) {
  return {
    id: OFFER_ID,
    dishName: 'Rosół',
    items: [],
    price: 18.5,
    currency: 'PLN',
    description: null,
    restaurantName: 'Bar Stary',
    restaurantAddress: null,
    restaurantLocation: null,
    availableDate: '2026-10-04',
    cuisineType: null,
    dietaryTags: [],
    allergens: [],
    sourceType: 'text',
    userId,
    sessionToken: 'tok',
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
  };
}

/** The action's answer for a caller who may or may not modify. */
function access(userId: string | null, allowed: boolean) {
  return {
    success: true as const,
    data: { offer: offer(userId), canModify: allowed, canDelete: allowed },
  };
}

/** Next.js hands `params` over as a promise of the route segment. */
const params = Promise.resolve({ id: OFFER_ID });

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOfferWithAccessAction.mockResolvedValue(access('11111111-1111-1111-1111-111111111111', true));
});

describe('the edit page obeys canModify', () => {
  it('shows the form when the caller may modify', async () => {
    render(<EditOfferPage params={params} />);

    await waitFor(() => expect(screen.getByRole('button', { name: /zapisz/i })).toBeInTheDocument());
  });

  it('refuses when the caller may not', async () => {
    mockGetOfferWithAccessAction.mockResolvedValue(
      access('11111111-1111-1111-1111-111111111111', false)
    );

    render(<EditOfferPage params={params} />);

    await waitFor(() => expect(screen.getByText(/nie masz uprawnień/i)).toBeInTheDocument());
    // The button specifically: a form with a dead button is the state this page
    // was in before, one step later.
    expect(screen.queryByRole('button', { name: /zapisz/i })).not.toBeInTheDocument();
  });

  it('shows the form to an admin on a record with no owner', async () => {
    // The case the admin panel depends on. `checkOwnership` returns false for a
    // null record owner by design, so without the admin branch an orphan would be
    // permanently uncorrectable -- which is what #54 closed.
    mockGetOfferWithAccessAction.mockResolvedValue(access(null, true));

    render(<EditOfferPage params={params} />);

    await waitFor(() => expect(screen.getByRole('button', { name: /zapisz/i })).toBeInTheDocument());
  });
});

describe('a missing offer is a 404, not a refusal', () => {
  it('on the edit page', async () => {
    mockGetOfferWithAccessAction.mockResolvedValue({ success: false, error: 'not found' });

    render(<EditOfferPage params={params} />);

    await waitFor(() => expect(screen.getByText(/nie znaleziono oferty/i)).toBeInTheDocument());
    // "This does not exist" and "you may not touch this" are different answers,
    // and merging them would tell a prober that a particular id is real.
    expect(screen.queryByText(/nie masz uprawnień/i)).not.toBeInTheDocument();
  });
});
