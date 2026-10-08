/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RestoreOfferLocationButton } from './RestoreOfferLocationButton';

const mocks = vi.hoisted(() => ({ update: vi.fn(), refresh: vi.fn() }));
vi.mock('@/actions/offers', () => ({ updateOfferAction: mocks.update }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('requests an explicit server-side snapshot repair and refreshes the admin row', async () => {
  mocks.update.mockResolvedValue({ success: true, data: { restaurantAddress: 'Wrocław', restaurantLocation: { latitude: 51, longitude: 17 } } });
  render(<RestoreOfferLocationButton offerId="offer" />);
  fireEvent.click(screen.getByRole('button', { name: 'Pobierz adres restauracji' }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  expect(mocks.update).toHaveBeenCalledWith('offer', { useRestaurantLocation: true });
  expect(screen.getByRole('status')).toHaveTextContent('Pobrano adres i lokalizację restauracji.');
});

it('reports coordinates without claiming to restore an absent address', async () => {
  mocks.update.mockResolvedValue({ success: true, data: { restaurantAddress: null, restaurantLocation: { latitude: 51, longitude: 17 } } });
  render(<RestoreOfferLocationButton offerId="offer" />);
  fireEvent.click(screen.getByRole('button', { name: 'Pobierz adres restauracji' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Pobrano współrzędne restauracji. Restauracja nie ma adresu.');
  expect(mocks.refresh).toHaveBeenCalled();
});

it('reports when neither an address nor coordinates can be restored', async () => {
  mocks.update.mockResolvedValue({ success: true, data: { restaurantAddress: null, restaurantLocation: null } });
  render(<RestoreOfferLocationButton offerId="offer" />);
  fireEvent.click(screen.getByRole('button', { name: 'Pobierz adres restauracji' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Restauracja nie ma adresu ani współrzędnych. Uzupełnij jej dane.');
});

it('reports that a saved address still has no coordinates', async () => {
  mocks.update.mockResolvedValue({ success: true, locationWarning: true, data: { restaurantAddress: 'Wrocław', restaurantLocation: null } });
  render(<RestoreOfferLocationButton offerId="offer" />);
  fireEvent.click(screen.getByRole('button', { name: 'Pobierz adres restauracji' }));
  expect(await screen.findByRole('status')).toHaveTextContent('nie udało się ustalić współrzędnych');
});

it('shows authorization failures without refreshing or claiming a repair', async () => {
  mocks.update.mockResolvedValue({ success: false, error: 'Brak uprawnień' });
  render(<RestoreOfferLocationButton offerId="offer" />);
  fireEvent.click(screen.getByRole('button', { name: 'Pobierz adres restauracji' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Brak uprawnień');
  expect(mocks.refresh).not.toHaveBeenCalled();
});
