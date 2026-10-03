/**
 * @vitest-environment jsdom
 */
// Regression tests for publishing a weekly menu extracted from a photo.
//
// The reported failure: the photo analyzed fine and the preview rendered, then
// publishing threw. The cause was not a malformed payload -- `createOfferSchema`
// accepts a well-formed weekly batch, verified against the real database. It was
// that `restaurantName` is regularly null for a menu photo, and both the preview
// and the batch builder turned that null into `""`, which fails
// `restaurantName: z.string().min(1)` on every day of the menu at once. The User
// saw a bare "Validation failed" because the batch action dropped fieldErrors.

import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrefilledOffer } from '@/lib/validations/extraction';
import { WeeklyMenuPreview } from './WeeklyMenuPreview';

afterEach(cleanup);

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

describe('WeeklyMenuPreview: restaurant name', () => {
  it('blocks publishing when the AI read no restaurant name', () => {
    const onConfirm = vi.fn();
    render(<WeeklyMenuPreview offer={menuWithoutName()} onConfirm={onConfirm} />);

    expect(publishButton()).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('publishes once the User supplies the missing name', () => {
    const onConfirm = vi.fn();
    render(<WeeklyMenuPreview offer={menuWithoutName()} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByLabelText(/Nazwa restauracji/), {
      target: { value: 'Bar Mleko' },
    });

    expect(publishButton()).not.toBeDisabled();
    fireEvent.click(publishButton());

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [, name] = onConfirm.mock.calls[0];
    expect(name).toBe('Bar Mleko');
  });

  it('sends the edited name rather than the extracted one', () => {
    const onConfirm = vi.fn();
    render(<WeeklyMenuPreview offer={menuWithName()} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByLabelText(/Nazwa restauracji/), {
      target: { value: '  Bar Mleko Nowy  ' },
    });
    fireEvent.click(publishButton());

    const [, name] = onConfirm.mock.calls[0];
    expect(name).toBe('Bar Mleko Nowy');
  });

  it('explains why the name is required when the AI could not read it', () => {
    render(<WeeklyMenuPreview offer={menuWithoutName()} onConfirm={vi.fn()} />);
    expect(screen.getByText(/AI nie odczytało nazwy restauracji|bez niej żadna oferta/)).toBeTruthy();
  });

  it('publishes normally when the AI read the name', () => {
    const onConfirm = vi.fn();
    render(<WeeklyMenuPreview offer={menuWithName()} onConfirm={onConfirm} />);

    expect(publishButton()).not.toBeDisabled();
    fireEvent.click(publishButton());

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][1]).toBe('Bar Mleko');
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
    render(<WeeklyMenuPreview offer={offer} onConfirm={onConfirm} />);

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
    render(<WeeklyMenuPreview offer={offer} onConfirm={onConfirm} />);

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
    render(<WeeklyMenuPreview offer={offer} onConfirm={onConfirm} />);

    fireEvent.click(publishButton());
    expect(onConfirm.mock.calls[0][0]).toHaveLength(1);
  });
});