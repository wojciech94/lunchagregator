/**
 * @vitest-environment jsdom
 */
// Tests for the attach control (#74): the „Bez restauracji" bucket's way out.
//
// The assignment step itself is mocked to a button -- its states are covered
// in RestaurantAssignment.test.tsx. What is under test here is the control's
// contract: expand on demand, one decision covers the whole sub-group, the
// action receives the right ids, success refreshes the page (the offers
// reappear as a linked group), and a failure surfaces without refreshing.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assignOfferRestaurantAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/actions/offers', () => ({
  assignOfferRestaurantAction: mocks.assignOfferRestaurantAction,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock('@/components/add-offer/RestaurantAssignment', () => ({
  RestaurantAssignment: ({
    onAssigned,
  }: {
    onAssigned: (r: { id: string; name: string; address: string | null }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onAssigned({ id: 'r-1', name: 'Bar Mleko', address: null })
      }
    >
      przypisz
    </button>
  ),
}));

import { AssignRestaurantControl } from './AssignRestaurantControl';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AssignRestaurantControl', () => {
  it('starts collapsed; the action runs only after the User assigns', () => {
    render(
      <AssignRestaurantControl
        offerIds={['o-1', 'o-2']}
        snapshotName="Pizzeria Roma"
      />
    );

    expect(
      screen.getByRole('button', { name: /Przypisz restaurację/ })
    ).toBeInTheDocument();
    expect(mocks.assignOfferRestaurantAction).not.toHaveBeenCalled();
  });

  it('one decision attaches the whole sub-group and refreshes the page', async () => {
    mocks.assignOfferRestaurantAction.mockResolvedValue({
      success: true,
      data: { attached: 2, skippedAlreadyLinked: 0 },
    });

    render(
      <AssignRestaurantControl
        offerIds={['o-1', 'o-2']}
        snapshotName="Pizzeria Roma"
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /Przypisz restaurację/ })
    );
    fireEvent.click(screen.getByRole('button', { name: 'przypisz' }));

    await waitFor(() => {
      expect(mocks.assignOfferRestaurantAction).toHaveBeenCalledWith(
        ['o-1', 'o-2'],
        'r-1'
      );
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
    });
  });

  it('a failed assignment surfaces the error and does not refresh', async () => {
    mocks.assignOfferRestaurantAction.mockResolvedValue({
      success: false,
      error: 'Brak uprawnień do tej operacji',
    });

    render(
      <AssignRestaurantControl
        offerIds={['o-1']}
        snapshotName="Pizzeria Roma"
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /Przypisz restaurację/ })
    );
    fireEvent.click(screen.getByRole('button', { name: 'przypisz' }));

    await screen.findByText('Brak uprawnień do tej operacji');
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
