/**
 * @vitest-environment jsdom
 */
// Bug-condition exploration for the single-offer form's availability date
// (spec: .kiro/specs/extracted-offer-date-fix, task 1).
//
// The claim: `buildDefaultValues` ignores a recognized `dayOfWeek` on the first
// extracted dish and always initializes `availableDate` with a UTC-derived
// "today", so a dish the AI marked as Friday opens dated today (Thursday), and
// a form opened just after local midnight shows yesterday's date -- which the
// database trigger then rejects.
//
// These tests assert the EXPECTED (post-fix) behavior. On the unfixed form the
// two "counterexample" tests are expected to fail with exactly the dates named
// in the spec; the controls (same-day weekday, null weekday fallback, weekly
// utility) are expected to pass on unfixed code and prove the defect is scoped
// to the single-offer initialization path.
//
// The clock is frozen; only `Date` is faked so rendering timers stay real.
// All frozen instants are mid-day or post-midnight local dates, so the local
// weekday is TZ-robust for any reasonable offset.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrefilledDish, PrefilledOffer } from '@/lib/validations/extraction';
import type { DayOfWeek } from '@/services/ai-analyzer';
import { nextDateForDay, toISODate } from '@/utils/day-of-week';
import { OfferForm } from './OfferForm';

// jsdom does not implement ResizeObserver; the Radix Select trigger measures
// itself on mount via @radix-ui/react-use-size. Stubbed per test so the
// afterEach unstub never strips it mid-file.
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function dish(dayOfWeek: DayOfWeek | null): PrefilledDish {
  return {
    name: 'Zestaw obiadowy',
    price: 25.5,
    description: 'Zupa i drugie danie',
    items: ['Zupa pomidorowa', 'Kotlet schabowy'],
    dietaryTags: [],
    allergens: [],
    dayOfWeek,
    missingFields: [],
  };
}

function offer(dayOfWeek: DayOfWeek | null): PrefilledOffer {
  return {
    restaurantName: 'Bar Mleko',
    address: 'Marszałkowska 10, Warszawa',
    dishes: [dish(dayOfWeek)],
    missingFields: [],
  };
}

function freezeAt(localDate: [number, number, number], hour = 12) {
  vi.useFakeTimers({
    now: new Date(localDate[0], localDate[1] - 1, localDate[2], hour, 0, 0),
    toFake: ['Date'],
  });
}

function availableDateInput(): HTMLInputElement {
  return screen.getByLabelText(/Data dostępności/) as HTMLInputElement;
}

describe('OfferForm: extracted weekday should prefill the availability date', () => {
  it('COUNTEREXAMPLE 1: friday dish opened on local Thursday 2026-07-30 → 2026-07-31', () => {
    freezeAt([2026, 7, 30]);
    render(<OfferForm prefilledData={offer('friday')} sourceType="text" onSubmit={vi.fn()} />);

    // Spec example: the form must prefill the Friday after (2026-07-31);
    // the defect is the plain default (2026-07-30).
    expect(availableDateInput().value).toBe('2026-07-31');
  });

  it('COUNTEREXAMPLE 2: monday dish opened on local Friday 2026-07-31 → 2026-08-03', () => {
    freezeAt([2026, 7, 31]);
    render(<OfferForm prefilledData={offer('monday')} sourceType="text" onSubmit={vi.fn()} />);

    // Rollover: an earlier weekday resolves to the following week, never back.
    expect(availableDateInput().value).toBe('2026-08-03');
  });

  it('control, same-day: thursday dish opened on Thursday → today (2026-07-30)', () => {
    freezeAt([2026, 7, 30]);
    render(<OfferForm prefilledData={offer('thursday')} sourceType="text" onSubmit={vi.fn()} />);

    // Inclusive semantics: today counts as a match. Passes on unfixed code too
    // (the default happens to equal the answer), so it is not proof of a fix.
    expect(availableDateInput().value).toBe('2026-07-30');
  });

  it('control, null weekday: falls back to the local current date', () => {
    freezeAt([2026, 7, 30]);
    render(<OfferForm prefilledData={offer(null)} sourceType="text" onSubmit={vi.fn()} />);

    expect(availableDateInput().value).toBe('2026-07-30');
  });

  it('preserves the other extracted fields alongside the date', () => {
    freezeAt([2026, 7, 30]);
    render(<OfferForm prefilledData={offer('friday')} sourceType="text" onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/Nazwa dania/)).toHaveValue('Zestaw obiadowy');
    expect(screen.getByLabelText(/Cena \(PLN\)/)).toHaveValue(25.5);
    expect(screen.getByLabelText(/Nazwa restauracji/)).toHaveValue('Bar Mleko');
  });

  it('UTC boundary: form opened at local 00:30 on 2026-07-30 shows the LOCAL date, not the UTC one', () => {
    freezeAt([2026, 7, 30], 0);
    vi.setSystemTime(new Date(2026, 6, 30, 0, 30, 0));

    const localToday = toISODate(new Date());
    const utcToday = new Date().toISOString().slice(0, 10);
    // The UTC-vs-local discrepancy only exists in timezones ahead of UTC at
    // this instant; skip (with the numbers visible) where it cannot be shown.
    if (localToday === utcToday) {
      console.warn(
        `[skipped-in-this-tz] local=${localToday} utc=${utcToday} tz=${Intl.DateTimeFormat().resolvedOptions().timeZone}`
      );
      return;
    }

    render(<OfferForm prefilledData={offer(null)} sourceType="text" onSubmit={vi.fn()} />);

    // Unfixed: toISOString() yields 2026-07-29 (yesterday) → the DB trigger
    // rejects the submission the User never edited.
    expect(availableDateInput().value).toBe(localToday);
    expect(availableDateInput().min).toBe(localToday);
  });
});

describe('OfferForm: preservation (spec properties 3 & 4)', () => {
  it('malformed weekday values are treated as absent at the resolution boundary', () => {
    freezeAt([2026, 7, 30]);
    for (const bad of ['poniedzialek', 'FRIDAY', 42]) {
      const malformed: PrefilledOffer = {
        ...offer(null),
        dishes: [{ ...dish(null), dayOfWeek: bad as unknown as DayOfWeek }],
      };
      const { unmount } = render(
        <OfferForm prefilledData={malformed} sourceType="text" onSubmit={vi.fn()} />
      );
      // Normal local default, no crash, no invalid date.
      expect(availableDateInput().value).toBe('2026-07-30');
      expect(availableDateInput().value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      unmount();
    }
  });

  it('an absent weekday (undefined at runtime) retains the local-date default', () => {
    freezeAt([2026, 7, 30]);
    const absent = offer(null);
    delete (absent.dishes[0] as unknown as Record<string, unknown>).dayOfWeek;
    render(<OfferForm prefilledData={absent} sourceType="text" onSubmit={vi.fn()} />);

    expect(availableDateInput().value).toBe('2026-07-30');
  });

  it('a past date is rejected with field-level feedback and the manual value survives', async () => {
    freezeAt([2026, 7, 30]);
    const onSubmit = vi.fn();
    render(<OfferForm prefilledData={offer(null)} sourceType="text" onSubmit={onSubmit} />);

    fireEvent.change(availableDateInput(), { target: { value: '2026-07-01' } });
    fireEvent.click(screen.getByRole('button', { name: /Opublikuj ofertę/ }));

    await screen.findByText('Available date must be today or within the next 30 days');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(availableDateInput().value).toBe('2026-07-01');
  });

  it('a date more than 30 days ahead is rejected the same way', async () => {
    freezeAt([2026, 7, 30]);
    const onSubmit = vi.fn();
    render(<OfferForm prefilledData={offer(null)} sourceType="text" onSubmit={onSubmit} />);

    fireEvent.change(availableDateInput(), { target: { value: '2026-09-15' } });
    fireEvent.click(screen.getByRole('button', { name: /Opublikuj ofertę/ }));

    await screen.findByText('Available date must be today or within the next 30 days');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(availableDateInput().value).toBe('2026-09-15');
  });

  it('a missing date is rejected', async () => {
    freezeAt([2026, 7, 30]);
    const onSubmit = vi.fn();
    render(<OfferForm prefilledData={offer(null)} sourceType="text" onSubmit={onSubmit} />);

    fireEvent.change(availableDateInput(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Opublikuj ofertę/ }));

    await screen.findByText('Available date must be today or within the next 30 days');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('after a rejected submission, corrected edits are submitted (error recovery)', async () => {
    freezeAt([2026, 7, 30]);
    const onSubmit = vi.fn();
    render(<OfferForm prefilledData={offer(null)} sourceType="text" onSubmit={onSubmit} />);

    fireEvent.change(availableDateInput(), { target: { value: '2026-07-01' } });
    fireEvent.click(screen.getByRole('button', { name: /Opublikuj ofertę/ }));
    await screen.findByText('Available date must be today or within the next 30 days');
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(availableDateInput(), { target: { value: '2026-07-31' } });
    fireEvent.change(screen.getByLabelText(/Nazwa dania/), {
      target: { value: 'Pierogi ruskie' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Opublikuj ofertę/ }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const submitted = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(submitted.availableDate).toBe('2026-07-31');
    expect(submitted.dishName).toBe('Pierogi ruskie');
    expect(submitted.price).toBe(25.5);
  });
});

describe('control: the weekly utility already resolves dates correctly', () => {
  it('nextDateForDay(friday, Thu 2026-07-30) → 2026-07-31', () => {
    expect(nextDateForDay('friday', new Date(2026, 6, 30, 12))).toBe('2026-07-31');
  });

  it('nextDateForDay(monday, Fri 2026-07-31) → 2026-08-03', () => {
    expect(nextDateForDay('monday', new Date(2026, 6, 31, 12))).toBe('2026-08-03');
  });
});
