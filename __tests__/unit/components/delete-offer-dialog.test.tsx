/**
 * @vitest-environment jsdom
 */
/**
 * The delete confirmation dialog, which replaces the `/offers/[id]/delete` page.
 *
 * That page cost two navigations to ask one question and then sent the reader to
 * the public offer list afterwards -- the wrong destination from every page that
 * could reach it, and a panel operator had to walk back to the panel by hand.
 *
 * Two behaviours here are load-bearing and neither is obvious from the markup:
 *
 *  - The dialog does not close on success. It swaps to "usunięto" and only
 *    refreshes the list when the reader closes it. Refreshing first would unmount
 *    this component -- it lives inside the row that just disappeared -- and take
 *    the confirmation with it. Closing first would give no confirmation at all,
 *    and a row that vanishes is indistinguishable from a refresh that failed.
 *  - `redirectTo` decides what happens next, because the two call sites want
 *    opposite things: the panel stays put, a detail page cannot stay because the
 *    record it is showing no longer exists.
 *
 * The cancel path is here because it was broken once: "Anuluj" and the success
 * button were plain buttons with an onClick, which reset this component's state
 * and left the dialog open on screen. A cancel that does not cancel.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { DeleteOfferButton } from '@/components/offers/DeleteOfferButton';

const OFFER_ID = '33333333-3333-3333-3333-333333333333';

const mockDeleteOfferAction = vi.fn();

vi.mock('@/actions/offers', () => ({
  deleteOfferAction: (...args: unknown[]) => mockDeleteOfferAction(...args),
}));

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh, back: vi.fn() }),
}));

const offer = {
  id: OFFER_ID,
  dishName: 'Rosół',
  restaurantName: 'Bar Stary',
  price: 18.5,
  currency: 'PLN',
  hasOwner: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDeleteOfferAction.mockResolvedValue({ success: true, data: undefined });
});

async function openDialog(offerOverrides: Partial<typeof offer> = {}) {
  render(<DeleteOfferButton offer={{ ...offer, ...offerOverrides }} />);
  fireEvent.click(screen.getByRole('button', { name: /^usuń$/i }));
  await screen.findByRole('dialog');
}

/** Presses the confirm button and waits for the action to have been called. */
async function confirm() {
  fireEvent.click(screen.getByRole('button', { name: /usuń ofertę/i }));
  await waitFor(() => expect(mockDeleteOfferAction).toHaveBeenCalled());
}

describe('asking for confirmation', () => {
  it('does nothing on its own -- no dialog until the button is pressed', () => {
    render(<DeleteOfferButton offer={offer} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockDeleteOfferAction).not.toHaveBeenCalled();
  });

  it('names the record, so the reader knows which row they chose', async () => {
    await openDialog();

    expect(screen.getByText('Rosół')).toBeInTheDocument();
    expect(screen.getByText('Bar Stary')).toBeInTheDocument();
    expect(screen.getByText('18.50 PLN')).toBeInTheDocument();
    // A confirmation that says only "sure?" leaves the reader recalling which row
    // they clicked, and this one sits on a list of rows that all look alike.
  });

  it('warns that the record has no owner', async () => {
    await openDialog({ hasOwner: false });

    expect(screen.getByText(/ta oferta nie ma właściciela/i)).toBeInTheDocument();
  });

  it('does not warn when the record has an owner', async () => {
    // The warning would be noise on every ordinary deletion, which is how a
    // warning stops being read.
    await openDialog();

    expect(screen.queryByText(/ta oferta nie ma właściciela/i)).not.toBeInTheDocument();
  });

  it('cancels without deleting', async () => {
    await openDialog();

    fireEvent.click(screen.getByRole('button', { name: /anuluj/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockDeleteOfferAction).not.toHaveBeenCalled();
  });
});

describe('deleting', () => {
  it('calls the action for that offer', async () => {
    await openDialog();

    await confirm();

    expect(mockDeleteOfferAction).toHaveBeenCalledWith(OFFER_ID);
  });

  it('keeps the dialog open and says it worked', async () => {
    // The whole reason the refresh is deferred: closing here would leave the
    // reader with nothing but a row that disappeared.
    await openDialog();

    await confirm();

    expect(await screen.findByText(/oferta usunięta/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('refreshes nothing while the dialog is still open', async () => {
    // Otherwise the row unmounts, takes this component with it, and the
    // confirmation never renders.
    await openDialog();

    await confirm();
    await screen.findByText(/oferta usunięta/i);

    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('refreshes in place once the reader dismisses it, with no redirectTo', async () => {
    // The panel's case: the operator stays on the list they are working through.
    await openDialog();

    await confirm();
    await screen.findByText(/oferta usunięta/i);
    fireEvent.click(screen.getByRole('button', { name: /gotowe/i }));

    expect(mockRefresh).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('goes to redirectTo instead of refreshing, when given one', async () => {
    // The detail page's case: the record it is showing is gone, so re-rendering it
    // would render a 404 the reader caused.
    render(<DeleteOfferButton offer={offer} redirectTo="/" />);
    fireEvent.click(screen.getByRole('button', { name: /^usuń$/i }));
    await screen.findByRole('dialog');

    await confirm();
    await screen.findByText(/oferta usunięta/i);
    fireEvent.click(screen.getByRole('button', { name: /gotowe/i }));

    expect(mockPush).toHaveBeenCalledWith('/');
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe('when the deletion is refused', () => {
  it('shows why, and stays open', async () => {
    mockDeleteOfferAction.mockResolvedValue({ success: false, error: 'Brak uprawnień' });
    await openDialog();

    await confirm();

    expect(await screen.findByRole('alert')).toHaveTextContent('Brak uprawnień');
    // Still open, and no navigation: the row is still there, so leaving the page
    // would be a lie about what happened.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('clears the refusal when the reader cancels and comes back', async () => {
    mockDeleteOfferAction.mockResolvedValue({ success: false, error: 'Brak uprawnień' });
    render(<DeleteOfferButton offer={offer} />);

    fireEvent.click(screen.getByRole('button', { name: /^usuń$/i }));
    await screen.findByRole('dialog');
    await confirm();
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: /anuluj/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^usuń$/i }));
    await screen.findByRole('dialog');

    // Reopening must not resurrect the previous failure: the reader has moved on,
    // and a stale error is a claim about a state nobody is in any more.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lets the reader try again after a refusal', async () => {
    mockDeleteOfferAction.mockResolvedValueOnce({ success: false, error: 'Brak uprawnień' });
    await openDialog();

    await confirm();
    await screen.findByRole('alert');

    mockDeleteOfferAction.mockResolvedValue({ success: true, data: undefined });
    fireEvent.click(screen.getByRole('button', { name: /usuń ofertę/i }));

    expect(await screen.findByText(/oferta usunięta/i)).toBeInTheDocument();
  });

  it('does not claim success when the offer is already gone', async () => {
    mockDeleteOfferAction.mockResolvedValue({ success: false, error: 'Offer not found' });
    await openDialog();

    await confirm();

    await screen.findByRole('alert');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText(/oferta usunięta/i)).not.toBeInTheDocument();
  });
});
