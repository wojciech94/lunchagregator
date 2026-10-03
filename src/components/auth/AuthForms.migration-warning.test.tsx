/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockRouter } from '../../../tests/setup';
import {
  MIGRATION_WARNING_MESSAGE,
  MIGRATION_WARNING_STORAGE_KEY,
} from '@/lib/migration-warning';

const { loginAction, registerAction, resendConfirmationAction } = vi.hoisted(() => ({
  loginAction: vi.fn(),
  registerAction: vi.fn(),
  resendConfirmationAction: vi.fn(),
}));

vi.mock('@/actions/auth', () => ({
  loginAction,
  registerAction,
  resendConfirmationAction,
}));

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

  it('tells a pending-confirmation user to check their inbox and does not navigate', async () => {
    registerAction.mockResolvedValue({
      success: true,
      pendingEmailConfirmation: true,
    });

    render(<RegisterForm />);
    await submitForm();

    await waitFor(() => {
      expect(screen.getByTestId('awaiting-confirmation')).toBeInTheDocument();
    });
    expect(screen.getByText(/owner@example\.com/)).toBeInTheDocument();
    // There is no session yet, so navigating would only show the login page.
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it('does not show the inbox message when registration fails', async () => {
    registerAction.mockResolvedValue({
      success: false,
      error: 'Konto z tym adresem e-mail już istnieje',
    });

    render(<RegisterForm />);
    await submitForm();

    await waitFor(() => {
      expect(
        screen.getByText('Konto z tym adresem e-mail już istnieje')
      ).toBeInTheDocument();
    });
    expect(screen.queryByTestId('awaiting-confirmation')).not.toBeInTheDocument();
  });
});

describe('resending the confirmation email', () => {
  async function registerIntoPendingState() {
    registerAction.mockResolvedValue({
      success: true,
      pendingEmailConfirmation: true,
    });
    render(<RegisterForm />);
    await submitForm();
    await waitFor(() => {
      expect(screen.getByTestId('awaiting-confirmation')).toBeInTheDocument();
    });
  }

  it('offers a resend button on the confirmation screen', async () => {
    await registerIntoPendingState();

    expect(
      screen.getByRole('button', { name: /Wyślij link ponownie/ })
    ).toBeInTheDocument();
  });

  it('resends the address that just registered', async () => {
    resendConfirmationAction.mockResolvedValue({ success: true });
    await registerIntoPendingState();

    fireEvent.click(screen.getByRole('button', { name: /Wyślij link ponownie/ }));

    await waitFor(() => {
      expect(resendConfirmationAction).toHaveBeenCalledTimes(1);
    });
    const formData = resendConfirmationAction.mock.calls[0][0] as FormData;
    expect(formData.get('email')).toBe('owner@example.com');
  });

  it('confirms the resend instead of claiming it before it happened', async () => {
    resendConfirmationAction.mockResolvedValue({ success: true });
    await registerIntoPendingState();

    fireEvent.click(screen.getByRole('button', { name: /Wyślij link ponownie/ }));

    await waitFor(() => {
      expect(screen.getByTestId('resend-sent')).toBeInTheDocument();
    });
    // One click, one send.
    expect(resendConfirmationAction).toHaveBeenCalledTimes(1);
  });

  it('surfaces a failed resend and keeps the button available', async () => {
    resendConfirmationAction.mockResolvedValue({
      success: false,
      error: 'Zbyt wiele wiadomości z prośbą o potwierdzenie. Spróbuj ponownie za kilka minut.',
    });
    await registerIntoPendingState();

    fireEvent.click(screen.getByRole('button', { name: /Wyślij link ponownie/ }));

    await waitFor(() => {
      expect(screen.getByTestId('resend-error')).toHaveTextContent(
        'Zbyt wiele wiadomości'
      );
    });
    // Still offered, because the User may succeed later.
    expect(
      screen.getByRole('button', { name: /Wyślij link ponownie/ })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('resend-sent')).not.toBeInTheDocument();
  });

  it('does not send when the user never reached the confirmation screen', () => {
    registerAction.mockResolvedValue({
      success: false,
      error: 'Nieprawidłowe dane formularza',
    });
    resendConfirmationAction.mockResolvedValue({ success: true });

    render(<RegisterForm />);

    expect(resendConfirmationAction).not.toHaveBeenCalled();
  });
});
