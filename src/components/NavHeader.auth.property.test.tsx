/**
 * @vitest-environment jsdom
 */
// Feature: user-authentication, Property 11: NavHeader renders the authenticated user's email and logout button

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fc } from '../../__tests__/properties/fc-config';
import { setMockUser } from '../../tests/setup';
import { NavHeader } from './NavHeader';

vi.mock('@/components/NavLinks', () => ({ NavLinks: () => null }));
vi.mock('@/components/NavMobileMenu', () => ({ NavMobileMenu: () => null }));
vi.mock('@/components/location/LocationIndicator', () => ({
  LocationIndicator: () => null,
}));
vi.mock('@/components/auth/LogoutButton', () => ({
  LogoutButton: () => <button type="submit">Wyloguj się</button>,
}));

/** Validates: Requirements 7.1 */

const characterArb = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789');
const tokenArb = (minLength: number, maxLength: number) =>
  fc.array(characterArb, { minLength, maxLength }).map((characters) => characters.join(''));
const emailArb = fc
  .tuple(tokenArb(1, 20), tokenArb(1, 20), fc.constantFrom('com', 'pl', 'io'))
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);
const authenticatedUserArb = fc.record({
  id: fc.uuid(),
  email: emailArb,
});

describe("Property 11: NavHeader renders the authenticated user's email and logout button", () => {
  it('renders authenticated controls and omits Guest links for every generated authenticated user', async () => {
    await fc.assert(
      fc.asyncProperty(authenticatedUserArb, async (user) => {
        setMockUser(user);

        try {
          render(await NavHeader());

          expect(screen.getByText(user.email, { exact: true })).toBeInTheDocument();
          fireEvent.click(screen.getByRole('button', { name: 'Menu profilu' }));
          expect(screen.getByRole('button', { name: 'Wyloguj się' })).toBeInTheDocument();
          expect(screen.queryByRole('link', { name: 'Zaloguj się' })).not.toBeInTheDocument();
          expect(screen.queryByRole('link', { name: 'Zarejestruj się' })).not.toBeInTheDocument();
        } finally {
          cleanup();
        }
      }),
      { numRuns: 100 }
    );
  }, 15000);
});
