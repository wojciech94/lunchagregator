/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RestaurantForm } from './RestaurantForm';

const actions = vi.hoisted(() => ({ createRestaurant: vi.fn(), updateRestaurant: vi.fn() }));
vi.mock('@/actions/restaurants', () => actions);
vi.mock('@/actions/geocode', () => ({ geocodeAddressAction: vi.fn().mockResolvedValue({ success: true, data: null }) }));
beforeEach(() => vi.stubGlobal('ResizeObserver', class {
  observe() {} unobserve() {} disconnect() {}
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('saves an unrelated edit with unchanged database-format lunch hours', async () => {
  actions.updateRestaurant.mockResolvedValue({ success: true, data: {} });
  render(<RestaurantForm restaurantId="restaurant-90" initialData={{ name: 'Pizza Si', address: 'Wrocław', lunchHours: { start: '12:00:00', end: '15:00:00' } }} />);
  fireEvent.change(screen.getByLabelText(/Opis/), { target: { value: 'Nowy opis' } });
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }));
  await waitFor(() => expect(actions.updateRestaurant).toHaveBeenCalled());
  expect(actions.updateRestaurant.mock.calls[0][1].lunchHours).toEqual({ start: '12:00', end: '15:00' });
});

it('explains and associates the location requirement with the address input', async () => {
  render(<RestaurantForm />);
  fireEvent.change(screen.getByLabelText(/Nazwa restauracji/), { target: { value: 'Pizza Si' } });
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj restaurację' }));
  const address = screen.getByLabelText(/^Adres/);
  expect(address).toHaveAttribute('aria-invalid', 'true');
  expect(address).toHaveAccessibleDescription(/adres|lokalizacj/i);
});

it('keeps an existing coordinate-only location when the optional address loses focus', async () => {
  actions.updateRestaurant.mockClear();
  actions.updateRestaurant.mockResolvedValue({ success: true, data: {} });
  const location = { latitude: 51.1, longitude: 17.03 };
  render(<RestaurantForm restaurantId="restaurant-90" initialData={{ name: 'Pizza Si', location }} />);
  fireEvent.blur(screen.getByLabelText(/^Adres/));
  fireEvent.change(screen.getByLabelText(/Opis/), { target: { value: 'Nowy opis' } });
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }));
  await waitFor(() => expect(actions.updateRestaurant).toHaveBeenCalled());
  expect(actions.updateRestaurant.mock.calls[0][1].location).toEqual(location);
});
