/**
 * @vitest-environment jsdom
 * Validates: Requirements 3.3, 7.2, 7.3, 7.5
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const getUser = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({ getUser }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/components/location/LocationIndicator', () => ({ LocationIndicator: () => null }));
vi.mock('@/components/NavLinks', () => ({ NavLinks: () => null }));
vi.mock('@/components/NavMobileMenu', () => ({ NavMobileMenu: () => null }));
vi.mock('@/components/auth/LogoutButton', () => ({ LogoutButton: () => <button type="button">Wyloguj się</button> }));

import { NavHeader } from './NavHeader';

const authenticatedUser = { id: 'owner-1', email: 'owner@example.com' };

async function renderHeader(user: typeof authenticatedUser | null) {
  getUser.mockResolvedValue(user);
  return render(await NavHeader());
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NavHeader auth-state transitions', () => {
  it('renders Guest controls while no session has been confirmed', async () => {
    await renderHeader(null);

    expect(screen.getByRole('link', { name: 'Zaloguj się' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zarejestruj się' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Wyloguj się' })).not.toBeInTheDocument();
  });

  it('updates for login and logout in under one second without unloading the page', async () => {
    const view = await renderHeader(null);
    const beforeUnload = vi.fn();
    window.addEventListener('beforeunload', beforeUnload);

    try {
      const loggedInAt = performance.now();
      getUser.mockResolvedValue(authenticatedUser);
      view.rerender(await NavHeader());
      expect(performance.now() - loggedInAt).toBeLessThan(1_000);
      expect(screen.getByText(authenticatedUser.email)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Menu profilu' }));
      expect(screen.getByRole('button', { name: 'Wyloguj się' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Zaloguj się' })).not.toBeInTheDocument();

      const loggedOutAt = performance.now();
      getUser.mockResolvedValue(null);
      view.rerender(await NavHeader());
      expect(performance.now() - loggedOutAt).toBeLessThan(1_000);
      expect(screen.getByRole('link', { name: 'Zaloguj się' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Zarejestruj się' })).toBeInTheDocument();
      expect(beforeUnload).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('beforeunload', beforeUnload);
    }
  });
});
