/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { setMockUser } from '../../tests/setup';
import { NavHeader } from './NavHeader';
import { appVersionLabel } from '@/lib/app-version';

vi.mock('@/components/NavLinks', () => ({ NavLinks: () => null }));
vi.mock('@/components/location/LocationIndicator', () => ({ LocationIndicator: () => null }));
vi.mock('@/components/auth/LogoutButton', () => ({ LogoutButton: () => <button>Wyloguj się</button> }));
afterEach(cleanup);

it('shows the signed-in email alongside logout in the mobile account block', async () => {
  const email = `${'long-account-name-'.repeat(5)}@example.test`;
  setMockUser({ id: 'owner-87', email });
  render(await NavHeader());
  fireEvent.click(screen.getByRole('button', { name: 'Otwórz menu' }));
  const menu = within(screen.getByRole('navigation', { name: 'Nawigacja mobilna' }));
  expect(menu.getByText(email, { exact: true })).toBeVisible();
  const badge = menu.getByText(appVersionLabel);
  expect(badge).toBeVisible();
  expect(within(badge.parentElement!).getByRole('button')).toBeVisible();
  expect(menu.getByRole('button', { name: 'Wyloguj się' })).toBeVisible();
});
