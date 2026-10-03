import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockRouter } from '../../../tests/setup';
import {
  MIGRATION_WARNING_MESSAGE,
  MIGRATION_WARNING_STORAGE_KEY,
} from '@/lib/migration-warning';

const { loginAction, registerAction } = vi.hoisted(() => ({
  loginAction: vi.fn(),
  registerAction: vi.fn(),
}));

vi.mock('@/actions/auth', () => ({ loginAction, registerAction }));

import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';

afterEach(() => {
  window.sessionStorage.clear();
});

async function submitForm() {
  fireEvent.change(screen.getByLabelText(/Adres e-mail/), {
    target: { value: 'owner@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/Hasło/), {
    target: { value: 'password123' },
  });
  fireEvent.click(screen.getByRole('button'));
}

describe('auth form migration warning delivery', () => {
  it('stores a login migration warning before navigating and refreshing the SPA', async () => {
    loginAction.mockResolvedValue({
      success: true,
      redirectTo: '/restaurants/new',
      migrationWarning: MIGRATION_WARNING_MESSAGE,
    });

    render(<LoginForm redirectTo="/restaurants/new" />);
    await submitForm();

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith('/restaurants/new');
    });
    expect(window.sessionStorage.getItem(MIGRATION_WARNING_STORAGE_KEY)).toBe(
      MIGRATION_WARNING_MESSAGE
    );
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
  });

  it('stores a registration migration warning before navigating and refreshing the SPA', async () => {
    registerAction.mockResolvedValue({
      success: true,
      redirectTo: '/',
      migrationWarning: MIGRATION_WARNING_MESSAGE,
    });

    render(<RegisterForm />);
    await submitForm();

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith('/');
    });
    expect(window.sessionStorage.getItem(MIGRATION_WARNING_STORAGE_KEY)).toBe(
      MIGRATION_WARNING_MESSAGE
    );
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
  });
});
