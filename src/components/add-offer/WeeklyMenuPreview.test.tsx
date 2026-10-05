/**
 * @vitest-environment jsdom
 */
// Tests for the weekly-menu batch preview under the restaurant-first flow
// (Req 8.1–8.3, #70).
//
// History worth keeping: publishing a weekly menu used to fail with a bare
// "Validation failed" when the AI read no restaurant name off the photo —
// one bad shared field sank every day at once (#39). The preview used to
// carry an editable name field as the workaround. That field is gone: the
// assignment step now guarantees a restaurant — name, address and
// `restaurantId` — before any preview opens, so the batch cannot be published
// without them. The component's own responsibility is narrower and is what
// these tests pin: showing the assigned restaurant, selecting days, and
// dropping dishes the schema would reject.

import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrefilledOffer } from '@/lib/validations/extraction';
import type { AssignedRestaurant } from '@/lib/restaurant-match';
import { WeeklyMenuPreview } from './WeeklyMenuPreview';

afterEach(cleanup);

const ASSIGNED: AssignedRestaurant = {
  id: 'r-1',
  name: 'Bar Mleko',
  address: 'Marszałkowska 10, Warszawa',
};

/** A weekly menu as the AI returns it when it read no restaurant name. */
function menuWithoutName(): PrefilledOffer {
  return {
    restaurantName: null,
    address: 'Marszałkowska 10, Warszawa',
    dishes: [
      { name: 'Kotlet schabowy', price: 24.9, description: '', items: ['Zupa', 'Kotlet'], dietaryTags: [], allergens: [], dayOfWeek: 'monday', missingFields: [] },
      { name: 'Pierogi ruskie', price: 22.0, description: '', items: [], dietaryTags: [], allergens: [], dayOfWeek: 'tuesday', missingFields: [] },
    ],
    missingFields: ['restaurantName'],
  };
}

function menuWithName(): PrefilledOffer {
  return { ...menuWithoutName(), restaurantName: 'Bar Mleko', missingFields: [] };
}

function publishButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /Opublikuj/ }) as HTMLButtonElement;
}

describe('WeeklyMenuPreview: the assigned restaurant', () => {
  it('shows the assigned restaurant the offer will publish under', () => {
    render(
      <WeeklyMenuPreview
        offer={menuWithoutName()}
        assignedRestaurant={ASSIGNED}
        onConfirm={vi.fn()}
      />
    );

    // The extraction read no name — the binding supplies it anyway.
    expect(screen.getByText('Bar Mleko')).toBeInTheDocument();
    expect(screen.getByText(/Marszałkowska 10, Warszawa/)).toBeInTheDocument();
    expect(screen.getByText(/Wszystkie dni tego menu/)).toBeInTheDocument();
  });

  it('publishes the selected days; the name comes from the binding, not the component', () => {
    const onConfirm = vi.fn();
    render(
      <WeeklyMenuPreview
        offer={menuWithName()}
        assignedRestaurant={ASSIGNED}
        onConfirm={onConfirm}
      />
    );

    expect(publishButton()).not.toBeDisabled();
    fireEvent.click(publishButton());

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [selected] = onConfirm.mock.calls[0];
    expect(selected).toHaveLength(2);
    expect(selected.map((entry: { dish: { name: string } }) => entry.dish.name)).toEqual([
      'Kotlet schabowy',
      'Pierogi ruskie',
    ]);
  });

  it('disables publishing when every day is deselected', () => {
    const onConfirm = vi.fn();
    render(
      <WeeklyMenuPreview
        offer={menuWithName()}
        assignedRestaurant={ASSIGNED}
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByText(/Poniedziałek/));
    fireEvent.click(screen.getByText(/Wtorek/));

    expect(publishButton()).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('WeeklyMenuPreview: dishes without a usable price', () => {
  it('drops a dish whose price is null', () => {
    const onConfirm = vi.fn();
    const offer = menuWithName();
    offer.dishes = [
      { ...offer.dishes[0], dayOfWeek: 'monday' },
      { name: 'Bez ceny', price: null, description: '', items: [], dietaryTags: [], allergens: [], dayOfWeek: 'tuesday', missingFields: ['price'] },
    ];
    render(
      <WeeklyMenuPreview offer={offer} assignedRestaurant={ASSIGNED} onConfirm={onConfirm} />
    );

    fireEvent.click(publishButton());
    expect(onConfirm.mock.calls[0][0]).toHaveLength(1);
  });

  it('drops a dish whose price is undefined, not just null', () => {
    // `price !== null` lets undefined through, which then fails validation on
    // the server as `price: Required` and sinks the whole batch.
    const onConfirm = vi.fn();
    const offer = menuWithName();
    offer.dishes = [
      { ...offer.dishes[0], dayOfWeek: 'monday' },
      { name: 'Bez ceny', price: undefined as unknown as number, description: '', items: [], dietaryTags: [], allergens: [], dayOfWeek: 'tuesday', missingFields: ['price'] },
    ];
    render(
      <WeeklyMenuPreview offer={offer} assignedRestaurant={ASSIGNED} onConfirm={onConfirm} />
    );

    fireEvent.click(publishButton());
    expect(onConfirm.mock.calls[0][0]).toHaveLength(1);
  });

  it('drops a dish priced at zero, which the schema also rejects', () => {
    const onConfirm = vi.fn();
    const offer = menuWithName();
    offer.dishes = [
      { ...offer.dishes[0], dayOfWeek: 'monday' },
      { name: 'Za darmo', price: 0, description: '', items: [], dietaryTags: [], allergens: [], dayOfWeek: 'tuesday', missingFields: [] },
    ];
    render(
      <WeeklyMenuPreview offer={offer} assignedRestaurant={ASSIGNED} onConfirm={onConfirm} />
    );

    fireEvent.click(publishButton());
    expect(onConfirm.mock.calls[0][0]).toHaveLength(1);
  });
});
