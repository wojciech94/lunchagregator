/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IMPORT_SOURCES } from '@/lib/lunch-import/sources';
const mocks = vi.hoisted(() => ({ configure: vi.fn() }));
vi.mock('@/actions/import-bindings', () => ({ configureImportBinding: mocks.configure }));
vi.mock('./LunchImportPanel', () => ({ LunchImportPanel: () => <div>Active preview control</div> }));
import { RestaurantImportSettings } from './RestaurantImportSettings';
afterEach(cleanup);
const restaurant = { id: '1070afce-ff35-4861-b940-f4eb783b9e40', name: 'Different spelling', address: 'Unverified address' };
describe('Admin branch verification', () => {
  it('shows discrepancy evidence and cannot activate without explicit confirmation', async () => {
    render(<RestaurantImportSettings restaurant={restaurant} bindings={[]} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Nazwa lub adres różni się');
    const button = screen.getByRole('button', { name: 'Potwierdź oddział i włącz import' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Podstawa potwierdzenia oddziału i wyjaśnienie różnic'), { target: { value: 'Sprawdzono lokal na oficjalnej stronie.' } });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(button).toBeEnabled();
    mocks.configure.mockResolvedValueOnce({ success: false, error: 'Configuration changed' });
    fireEvent.click(button);
    await screen.findByText('Configuration changed');
    expect(mocks.configure).toHaveBeenCalledWith(expect.objectContaining({ restaurantId: restaurant.id, confirmed: true, expectedAddress: restaurant.address }));
    expect(screen.queryByText('Active preview control')).not.toBeInTheDocument();
  });
  it('clears approval when changing evidence or source', () => {
    render(<RestaurantImportSettings restaurant={restaurant} bindings={[]} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sushi' } });
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Updated evidence' } });
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
  it('disables without publishing and removes the old preview after success', async () => {
    const source = IMPORT_SOURCES.sofa;
    const binding = { source_id: source.id, restaurant_id: restaurant.id, enabled: true,
      revision: '1070afce-ff35-4861-b940-f4eb783b9e41', verified_name: restaurant.name, verified_address: restaurant.address,
      source_url: source.url, source_name: source.restaurantName, source_address: source.branchAddress,
      verification_note: 'Official branch checked', verified_at: '2026-10-09T08:00:00Z', verified_by: 'admin' };
    mocks.configure.mockResolvedValueOnce({ success: true, data: { ...binding, enabled: false } });
    render(<RestaurantImportSettings restaurant={restaurant} bindings={[binding]} />);
    expect(screen.getByText('Active preview control')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Wyłącz import' }));
    await waitFor(() => expect(screen.queryByText('Active preview control')).not.toBeInTheDocument());
    expect(mocks.configure).toHaveBeenCalledWith(expect.objectContaining({ action: 'disable', revision: binding.revision }));
  });
  it('cannot silently move a source already bound to another Restaurant', () => {
    const source = IMPORT_SOURCES.sofa;
    render(<RestaurantImportSettings restaurant={restaurant} bindings={[{
      source_id: source.id, restaurant_id: 'other-id', enabled: false, revision: 'revision',
      verified_name: '', verified_address: '', source_url: source.url, source_name: source.restaurantName,
      source_address: source.branchAddress, verification_note: 'Official source checked', verified_at: null, verified_by: null,
    }]} />);
    expect(screen.getByText(/To źródło jest już powiązane/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Potwierdź oddział i włącz import' })).not.toBeInTheDocument();
  });
});
