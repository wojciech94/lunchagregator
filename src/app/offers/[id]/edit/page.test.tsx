/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import EditOfferPage from './page';
import type { LunchOffer } from '@/types/offers';
import { todayISO } from '@/utils/day-of-week';

const actions = vi.hoisted(() => ({ getOfferWithAccessAction: vi.fn(), updateOfferAction: vi.fn() }));
vi.mock('@/actions/offers', () => actions);
afterEach(cleanup);

const offer: LunchOffer = {
  id: 'offer-90', dishName: 'Pizza Margherita', price: 34, currency: 'PLN',
  items: ['Pizza Margherita', 'Napój (kawa, oranżada lub woda)', 'Deser "dnia", owoce'],
  description: 'Lunch', restaurantName: 'Pizza Si', restaurantAddress: 'Wrocław',
  restaurantLocation: null, availableDate: todayISO(), cuisineType: 'wloska',
  dietaryTags: ['vegetarian'], allergens: ['mleko'], sourceType: 'text',
  userId: 'owner', sessionToken: '', createdAt: '', updatedAt: '',
};

it('preserves item boundaries and punctuation when saving an unrelated edit', async () => {
  actions.getOfferWithAccessAction.mockResolvedValue({ success: true, data: { offer, canModify: true } });
  actions.updateOfferAction.mockResolvedValue({ success: true, data: offer });
  render(<EditOfferPage params={Promise.resolve({ id: offer.id })} />);
  fireEvent.change(await screen.findByLabelText(/Opis/), { target: { value: 'Nowy opis' } });
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }));
  await waitFor(() => expect(actions.updateOfferAction).toHaveBeenCalled());
  expect(actions.updateOfferAction.mock.calls[0][1].items).toEqual(offer.items);
});

it('requires a price in the complete edit form rather than silently retaining an old value', async () => {
  actions.getOfferWithAccessAction.mockResolvedValue({ success: true, data: { offer, canModify: true } });
  actions.updateOfferAction.mockClear();
  render(<EditOfferPage params={Promise.resolve({ id: offer.id })} />);
  fireEvent.change(await screen.findByLabelText(/Cena/), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }));
  expect(await screen.findByText('Podaj cenę w PLN.')).toBeVisible();
  expect(actions.updateOfferAction).not.toHaveBeenCalled();
});

it('omits added and cleared blank rows while preserving nonblank item text exactly', async () => {
  const preservedItem = '  Napój (kawa, oranżada lub woda), "duży"  ';
  const loadedOffer = { ...offer, items: ['Pizza Margherita', preservedItem, 'Deser'] };
  actions.getOfferWithAccessAction.mockResolvedValue({ success: true, data: { offer: loadedOffer, canModify: true } });
  actions.updateOfferAction.mockClear();
  actions.updateOfferAction.mockResolvedValue({ success: true, data: loadedOffer });
  render(<EditOfferPage params={Promise.resolve({ id: offer.id })} />);
  fireEvent.change(await screen.findByLabelText('Pozycja zestawu 1'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Pozycja zestawu 3'), { target: { value: ' \t ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj pozycję' }));
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }));
  await waitFor(() => expect(actions.updateOfferAction).toHaveBeenCalled());
  expect(actions.updateOfferAction.mock.calls[0][1].items).toEqual([preservedItem]);
});
