/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { setMockPathname, setMockSearchParams } from '../../tests/setup';
import { NavMobileMenu } from './NavMobileMenu';

vi.mock('@/components/location/LocationIndicator', () => ({ LocationIndicator: () => <button>Location</button> }));
afterEach(cleanup);

it('marks the add-offer destination active in the mobile menu', () => {
  setMockPathname('/add');
  render(<NavMobileMenu isAuthenticated />);
  fireEvent.click(screen.getByRole('button', { name: 'Otwórz menu' }));
  expect(screen.getByRole('link', { name: 'Dodaj ofertę' })).toHaveAttribute('aria-current', 'page');
});

it('offers anonymous account links with the complete return address', () => {
  setMockSearchParams('date=2026-10-08&diets=vegetarian');
  render(<NavMobileMenu />);
  fireEvent.click(screen.getByRole('button', { name: 'Otwórz menu' }));
  for (const [name, route] of [['Zaloguj się', 'login'], ['Zarejestruj się', 'register']]) {
    expect(screen.getByRole('link', { name })).toHaveAttribute('href', `/auth/${route}?redirectTo=${encodeURIComponent('/?date=2026-10-08&diets=vegetarian')}`);
  }
});

it('exposes its expanded state and closes with Escape, returning focus', () => {
  render(<NavMobileMenu />);
  const toggle = screen.getByRole('button', { name: 'Otwórz menu' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  screen.getByRole('link', { name: 'Restauracje' }).focus();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  expect(toggle).toHaveFocus();
});

it('closes after navigation and marks only matching path segments active', () => {
  setMockPathname('/restaurants-old');
  const view = render(<NavMobileMenu />);
  fireEvent.click(screen.getByRole('button', { name: 'Otwórz menu' }));
  expect(screen.getByRole('link', { name: 'Restauracje' })).not.toHaveAttribute('aria-current');
  setMockPathname('/restaurants');
  view.rerender(<NavMobileMenu />);
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});
