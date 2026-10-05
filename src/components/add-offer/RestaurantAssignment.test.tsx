/**
 * @vitest-environment jsdom
 */
// Tests for the restaurant-first assignment step (Req 8.1–8.2, #70).
//
// The step's three states carry different guarantees:
//   matching — a search is in flight, nothing is assignable yet;
//   confirm  — the deterministic match is preselected, the User only approves;
//   choose   — the User decides: pick from search or create inline.
//
// Server actions are mocked; the component's own logic (phase transitions,
// create validation, the pick mapping) is what is under test.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RestaurantSummary } from '@/types/restaurants';
import { RestaurantAssignment } from './RestaurantAssignment';

vi.mock('@/actions/restaurants', () => ({
  searchRestaurants: vi.fn(),
  createRestaurant: vi.fn(),
}));

import { searchRestaurants, createRestaurant } from '@/actions/restaurants';

const mockedSearch = vi.mocked(searchRestaurants);
const mockedCreate = vi.mocked(createRestaurant);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function summary(
  id: string,
  name: string,
  address: string | null = 'ul. Testowa 1, Warszawa'
): RestaurantSummary {
  return { id, name, address, cuisineTypes: [] };
}

describe('auto-match', () => {
  it('confident match is preselected and confirmed with one click', async () => {
    mockedSearch.mockResolvedValue([summary('r-1', 'Bar Mleko')]);
    const onAssigned = vi.fn();
    render(
      <RestaurantAssignment extractedName="Bar Mleko" onAssigned={onAssigned} />
    );

    await screen.findByText('Bar Mleko');
    expect(mockedSearch).toHaveBeenCalledWith('Bar Mleko');

    fireEvent.click(screen.getByRole('button', { name: /To jest ta restauracja/ }));
    expect(onAssigned).toHaveBeenCalledWith({
      id: 'r-1',
      name: 'Bar Mleko',
      address: 'ul. Testowa 1, Warszawa',
    });
  });

  it('the User can reject the preselection and fall through to choosing', async () => {
    mockedSearch.mockResolvedValue([summary('r-1', 'Bar Mleko')]);
    render(
      <RestaurantAssignment extractedName="Bar Mleko" onAssigned={vi.fn()} />
    );

    await screen.findByText('Bar Mleko');
    fireEvent.click(
      screen.getByRole('button', { name: /To nie ta — wybierz ręcznie/ })
    );

    // The choose phase offers the existing search and the create toggle.
    expect(screen.getByText(/Wybierz istniejącą restaurację/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Dodaj nową restaurację/ })
    ).toBeInTheDocument();
  });
});

describe('choose phase', () => {
  it('is entered directly when the extraction read no name', () => {
    render(<RestaurantAssignment extractedName={null} onAssigned={vi.fn()} />);

    expect(screen.getByText(/Wybierz istniejącą restaurację/)).toBeInTheDocument();
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it('is entered when the search finds no confident match', async () => {
    mockedSearch.mockResolvedValue([
      summary('r-1', 'Bar Mleko Nowy Świat'),
      summary('r-2', 'Bar Mlekomat'),
    ]);

    render(<RestaurantAssignment extractedName="Bar Mleko" onAssigned={vi.fn()} />);

    await screen.findByText(/Wybierz istniejącą restaurację/);
    expect(screen.queryByText(/To jest ta restauracja/)).not.toBeInTheDocument();
  });

  it('create validates: a blank address is refused without calling the action', async () => {
    mockedSearch.mockResolvedValue([]);
    render(<RestaurantAssignment extractedName="Bar Mleko" onAssigned={vi.fn()} />);

    await screen.findByText(/Wybierz istniejącą restaurację/);
    fireEvent.click(screen.getByRole('button', { name: /Dodaj nową restaurację/ }));
    fireEvent.change(screen.getByLabelText(/Nazwa restauracji/), {
      target: { value: 'Bar Mleko' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Utwórz i przypisz/ }));

    await waitFor(() =>
      expect(
        screen.getByText(/Adres jest wymagany/)
      ).toBeInTheDocument()
    );
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('create succeeds and assigns the new restaurant', async () => {
    mockedSearch.mockResolvedValue([]);
    mockedCreate.mockResolvedValue({
      success: true,
      data: {
        id: 'r-new',
        name: 'Pierogarnia U Ali',
        address: 'Krakowskie Przedmieście 5, Warszawa',
        description: null,
        location: null,
        priceLevel: null,
        lunchHours: null,
        cuisineTypes: [],
        phoneNumber: null,
        websiteUrl: null,
        sessionToken: null,
        userId: null,
        createdAt: '',
        updatedAt: '',
      },
    });

    const onAssigned = vi.fn();
    render(<RestaurantAssignment extractedName="Pierogarnia U Ali" onAssigned={onAssigned} />);

    await screen.findByText(/Wybierz istniejącą restaurację/);
    fireEvent.click(screen.getByRole('button', { name: /Dodaj nową restaurację/ }));
    // The name input is prefilled from the extraction.
    expect(screen.getByLabelText(/Nazwa restauracji/)).toHaveValue(
      'Pierogarnia U Ali'
    );
    fireEvent.change(screen.getByLabelText(/^Adres/), {
      target: { value: 'Krakowskie Przedmieście 5, Warszawa' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Utwórz i przypisz/ }));

    await waitFor(() =>
      expect(onAssigned).toHaveBeenCalledWith({
        id: 'r-new',
        name: 'Pierogarnia U Ali',
        address: 'Krakowskie Przedmieście 5, Warszawa',
      })
    );
    expect(mockedCreate).toHaveBeenCalledWith({
      name: 'Pierogarnia U Ali',
      address: 'Krakowskie Przedmieście 5, Warszawa',
    });
  });

  it('a failed create keeps the form and surfaces the error', async () => {
    mockedSearch.mockResolvedValue([]);
    mockedCreate.mockResolvedValue({
      success: false,
      error: 'Nieprawidłowe dane restauracji',
    });

    render(<RestaurantAssignment extractedName="Bar Mleko" onAssigned={vi.fn()} />);

    await screen.findByText(/Wybierz istniejącą restaurację/);
    fireEvent.click(screen.getByRole('button', { name: /Dodaj nową restaurację/ }));
    fireEvent.change(screen.getByLabelText(/^Adres/), {
      target: { value: 'ul. Testowa 1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Utwórz i przypisz/ }));

    await screen.findByText('Nieprawidłowe dane restauracji');
    expect(screen.getByRole('button', { name: /Utwórz i przypisz/ })).toBeEnabled();
  });
});
