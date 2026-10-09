// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ configure: vi.fn() }));
vi.mock('@/actions/generic-source', () => ({ configureGenericSource: mocks.configure }));
vi.mock('./LunchImportPanel', () => ({ LunchImportPanel: () => <div>Active publication review</div> }));
import { GenericSourceSettings } from './GenericSourceSettings';
import type { ImportBinding } from '@/lib/lunch-import/binding-state';
const restaurant = { id: '1070afce-ff35-4861-b940-f4eb783b9e40', name: 'Restaurant', address: 'Branch' };
const binding: ImportBinding = { source_id: `html-${restaurant.id}`, restaurant_id: restaurant.id,
  revision: '1170afce-ff35-4861-b940-f4eb783b9e40', enabled: false, verified_name: restaurant.name,
  verified_address: restaurant.address, source_url: 'https://example.org/menu', source_name: restaurant.name,
  source_address: restaurant.address, verification_note: 'Unverified draft', verified_at: null, verified_by: null,
  trial: { supported: true, fetchedAt: new Date().toISOString(), finalUrl: 'https://example.org/menu', excerpt: 'Lunch Zupa 31 PLN',
    identityEvidence: 'Actual source title / Branch', limitations: [], dishes: [{ name: 'Zupa', price: 31 }] } };
afterEach(cleanup);
beforeEach(() => { mocks.configure.mockResolvedValue({ success: true, data: { ...binding, enabled: true, verified_at: new Date().toISOString(), verified_by: 'admin' } }); });
describe('generic source onboarding UI', () => {
  it('selects the image pilot, requires a saved draft and displays trial image evidence', () => {
    const view = render(<GenericSourceSettings restaurant={restaurant} />);
    fireEvent.click(screen.getByRole('button', { name: /Wybierz pilot Meatologii/ }));
    expect(screen.getByRole('textbox', { name: /Oficjalny URL/ })).toHaveValue('https://meatologia.pl/pages/nasze-lokale');
    expect(screen.getByRole('button', { name: 'Uruchom próbny odczyt zdjęcia menu' })).toBeDisabled();
    view.unmount();
    render(<GenericSourceSettings restaurant={restaurant} initial={{ ...binding, source_url: 'https://meatologia.pl/pages/nasze-lokale',
      trial: { ...binding.trial!, menuImage: { assetUrl: 'https://cdn.shopify.com/lunch.jpg', contentHash: 'a'.repeat(64) } } }} />);
    expect(screen.getByRole('link', { name: 'Sprawdź oryginalne zdjęcie menu' })).toHaveAttribute('href', 'https://cdn.shopify.com/lunch.jpg');
    expect(screen.getByRole('button', { name: 'Zweryfikuj i aktywuj nowe źródło' })).toBeDisabled();
  });
  it('requires draft before trial and explicit evidence before activation', async () => {
    const view = render(<GenericSourceSettings restaurant={restaurant} />);
    expect(screen.getByRole('button', { name: 'Uruchom próbny odczyt HTML' })).toBeDisabled();
    view.unmount(); render(<GenericSourceSettings restaurant={restaurant} initial={binding} />);
    expect(screen.getByText('Actual source title / Branch')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Zweryfikuj i aktywuj nowe źródło' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: /Podstawa/ }), { target: { value: 'Exact branch checked and menu current' } });
    fireEvent.click(screen.getByRole('checkbox')); expect(button).toBeEnabled();
    fireEvent.click(button); expect(await screen.findByText('Active publication review')).toBeInTheDocument();
    expect(mocks.configure).toHaveBeenCalledWith(expect.objectContaining({ action: 'confirm', confirmed: true }));
  });
  it('hides activation for ambiguous trials and resets it after URL or evidence edits', () => {
    const view = render(<GenericSourceSettings restaurant={restaurant} initial={{ ...binding, trial: { ...binding.trial!, supported: false, limitations: ['Ambiguous branch'] } }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Ambiguous branch');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    view.unmount(); render(<GenericSourceSettings restaurant={restaurant} initial={binding} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByRole('textbox', { name: /Podstawa/ }), { target: { value: 'Changed evidence' } });
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    fireEvent.change(screen.getByRole('textbox', { name: /Oficjalny URL/ }), { target: { value: 'https://example.org/new' } });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Uruchom próbny odczyt HTML' })).toBeDisabled();
  });
});
