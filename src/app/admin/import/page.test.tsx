/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ImportBinding } from '@/lib/lunch-import/binding-state';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), list: vi.fn(), resolve: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getAdmin: mocks.admin }));
vi.mock('@/lib/lunch-import/bindings', () => ({ listImportBindings: mocks.list, resolveImportSource: mocks.resolve }));
vi.mock('@/components/admin/LunchImportPanel', () => ({ LunchImportPanel: ({ name }: { name: string }) => <button>Pobierz {name}</button> }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('Not found'); } }));
import Page from './page';
const binding: ImportBinding = { source_id: 'sofa', restaurant_id: 'restaurant-id', enabled: true,
  revision: 'revision', source_name: 'Sofa', source_address: 'Saved address', source_url: 'https://example.org/menu',
  verified_name: 'Sofa', verified_address: 'Saved address', verification_note: 'Checked', verified_at: '2026-10-10T12:00:00Z', verified_by: 'admin' };
afterEach(cleanup);
beforeEach(() => { mocks.admin.mockResolvedValue({ id: 'admin' }); mocks.list.mockResolvedValue([binding]); mocks.resolve.mockResolvedValue(null); });
it('shows the actual branch, configuration state and Sofa uncertainty while keeping the source link accessible', async () => {
  mocks.resolve.mockResolvedValue({ restaurant: { name: 'Sofa branch', address: 'Current address' }, source: { label: 'Sofa' } });
  render(await Page());
  expect(screen.getByRole('heading', { name: 'Sofa branch' })).toBeInTheDocument();
  expect(screen.getByText('Current address')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Aktywna konfiguracja');
  expect(screen.getByRole('alert')).toHaveTextContent('Nie potwierdzono jej aktualności');
  expect(screen.getByRole('link', { name: 'Oficjalne źródło menu' })).toHaveAttribute('href', binding.source_url);
});
it.each([
  [{ enabled: false, verified_at: null }, 'Szkic'],
  [{ enabled: false }, 'Wyłączone'],
  [{}, 'Wymaga ponownej weryfikacji'],
])('shows actionable inactive states without a fetch control (%#)', async (patch, label) => {
  mocks.list.mockResolvedValue([{ ...binding, ...patch }]);
  render(await Page());
  expect(screen.getByRole('status')).toHaveTextContent(label);
  expect(screen.getByText(/Zapisana tożsamość/)).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Ustawienia źródła — Sofa' })).toHaveAttribute('href', '/restaurants/restaurant-id');
});
it('requires Admin before reading any source configuration', async () => {
  mocks.admin.mockResolvedValue(null);
  await expect(Page()).rejects.toThrow('Not found');
  expect(mocks.list).not.toHaveBeenCalled();
});
it('shows unsupported trial limitations and avoids claiming the saved identity is current', async () => {
  mocks.list.mockResolvedValue([{ ...binding, source_id: 'html-restaurant', enabled: false, verified_at: null,
    trial: { supported: false, limitations: ['Ambiguous branch'], dishes: [], fetchedAt: '2026-10-10T12:00:00Z', finalUrl: binding.source_url, excerpt: '', identityEvidence: '' } }]);
  render(await Page());
  expect(screen.getByRole('status')).toHaveTextContent('Próba nieobsługiwana');
  expect(screen.getByRole('alert')).toHaveTextContent('Ambiguous branch');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
