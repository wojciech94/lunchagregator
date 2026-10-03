/**
 * @vitest-environment jsdom
 */
// Requirement 6.5, the half a User can see.
//
// The server flag is covered in offer-location-warning.test.ts. This covers the
// part that would make that flag pointless: the auto-redirect.
//
// `/add` redirects to the offers list two seconds after a successful save. A
// warning dismissed by that redirect is not a message, it is a flicker -- and the
// requirement is about the User finding out that their offer will not appear in
// distance sorting.
//
// Reachability: `WeeklyMenuPreview` is mocked to a single button. The rest of
// this page is a multi-step wizard behind Radix tabs and an AI call, and a test
// that has to drive all of that is testing Radix. What is under test here is the
// success screen and the redirect decision, which render once the wizard
// reaches them -- and the flag travels on the action's return value, so the
// wizard's internals are not the subject.

import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  analyzeUrlAction: vi.fn(),
  analyzeTextAction: vi.fn(),
  analyzeImageAction: vi.fn(),
  createOfferAction: vi.fn(),
  createOffersBatchAction: vi.fn(),
  geocodeAddressAction: vi.fn(),
  push: vi.fn(),
  onConfirm: vi.fn(),
}));

vi.mock('@/actions/analyze', () => ({
  analyzeUrlAction: mocks.analyzeUrlAction,
  analyzeTextAction: mocks.analyzeTextAction,
  analyzeImageAction: mocks.analyzeImageAction,
}));
vi.mock('@/actions/offers', () => ({
  createOfferAction: mocks.createOfferAction,
  createOffersBatchAction: mocks.createOffersBatchAction,
}));
vi.mock('@/actions/geocode', () => ({ geocodeAddressAction: mocks.geocodeAddressAction }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));

import AddOfferPage from '@/app/add/page';

// The wizard's own step components, reduced to the single interaction each test
// needs. InputSelector normally owns the upload and the AI call; calling
// `onSubmit` is how the page's own handler gets invoked, which is the only way to
// move the wizard forward from a test. WeeklyMenuPreview is covered on its own.
vi.mock('@/components/add-offer/InputSelector', () => ({
  InputSelector: ({ onSubmit }: { onSubmit: (s: { type: string; value: string }) => void }) => (
    <button type="button" onClick={() => onSubmit({ type: 'photo', value: 'https://example.test/menu.jpg' })}>
      wyslij zdjecie
    </button>
  ),
}));

vi.mock('@/components/add-offer/WeeklyMenuPreview', () => ({
  WeeklyMenuPreview: ({ onConfirm }: { onConfirm: (s: unknown[], n: string) => void }) => (
    <button type="button" onClick={() => onConfirm([{ dish: {}, date: '2030-01-01' }], 'Bar Mleko')}>
      potwierdz menu
    </button>
  ),
}));

const WEEKLY = {
  offers: [
    {
      restaurantName: 'Bar Mleko',
      address: 'Marszałkowska 10, Warszawa',
      dishes: [
        { name: 'Kotlet', price: 24.9, description: '', items: [], dietaryTags: [], allergens: [], dayOfWeek: 'monday' },
        { name: 'Pierogi', price: 22, description: '', items: [], dietaryTags: [], allergens: [], dayOfWeek: 'tuesday' },
      ],
    },
  ],
  sourceType: 'photo',
  confidence: 0.9,
  missingFields: [],
};

/** Drives input -> analyzing -> weekly -> success. */
async function publishWeeklyMenu(missingCoordinates: number) {
  mocks.analyzeImageAction.mockResolvedValue({ success: true, data: WEEKLY });
  mocks.createOffersBatchAction.mockResolvedValue({
    success: true,
    data: { created: [], failed: [], missingCoordinates },
  });

  render(<AddOfferPage />);

  fireEvent.click(await screen.findByRole('button', { name: 'wyslij zdjecie' }));
  fireEvent.click(await screen.findByRole('button', { name: 'potwierdz menu' }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('/add and the missing-coordinates message', () => {
  it('shows it when the batch reports offers it could not place', async () => {
    await publishWeeklyMenu(2);

    await waitFor(() => {
      expect(screen.getByText(/nie pojawi się w sortowaniu/i)).toBeTruthy();
    });
    // The count is carried, because one shared address decides for every day.
    expect(screen.getByText(/Dotyczy to 2 ofert/i)).toBeTruthy();
  });

  it('does not redirect away while the message is showing', async () => {
    await publishWeeklyMenu(2);

    await waitFor(() => {
      expect(screen.getByText(/nie pojawi się w sortowaniu/i)).toBeTruthy();
    });

    // Well past the 2s the success screen would otherwise redirect on.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('says nothing when every offer was placed', async () => {
    await publishWeeklyMenu(0);

    await waitFor(() => {
      expect(screen.getByText(/Opublikowano/)).toBeTruthy();
    });
    expect(screen.queryByText(/nie pojawi się w sortowaniu/i)).toBeNull();
  });

  it('still offers a way out', async () => {
    await publishWeeklyMenu(2);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Przejdź do ofert/ })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /Przejdź do ofert/ }));
    expect(mocks.push).toHaveBeenCalledWith('/');
  });
});