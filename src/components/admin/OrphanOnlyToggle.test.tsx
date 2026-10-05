/**
 * @vitest-environment jsdom
 */
// Tests for the orphan-only toggle (#77): the checkbox is the control.
//
// It used to be static server HTML with the navigation wired to a link in
// parentheses -- clicking the checkbox did nothing. Now onChange pushes the
// target URL; the state still lives in the query string, so back and forward
// move it like every other URL-driven control.

import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

import { OrphanOnlyToggle } from './OrphanOnlyToggle';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('OrphanOnlyToggle (#77)', () => {
  it('unchecked: clicking the checkbox navigates to the filtered URL', () => {
    render(<OrphanOnlyToggle href="/admin/offers" checked={false} subject="oferty" />);

    fireEvent.click(screen.getByRole('checkbox'));

    expect(mocks.push).toHaveBeenCalledWith('/admin/offers?orphan=1');
  });

  it('checked: clicking it navigates back to the unfiltered URL', () => {
    render(<OrphanOnlyToggle href="/admin/offers" checked={true} subject="oferty" />);

    fireEvent.click(screen.getByRole('checkbox'));

    expect(mocks.push).toHaveBeenCalledWith('/admin/offers');
  });

  it('announces what the checkbox filters', () => {
    render(
      <OrphanOnlyToggle href="/admin/restaurants" checked={false} subject="restauracje" />
    );

    expect(
      screen.getByRole('checkbox', { name: 'Pokaż tylko restauracje bez właściciela' })
    ).toBeInTheDocument();
  });
});
