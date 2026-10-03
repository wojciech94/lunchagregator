import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mockRedirect,
  mockSupabaseAuth,
  mockSupabaseClient,
  setMockCookie,
} from '../../tests/setup';
import { loginAction, logoutAction, registerAction } from './auth';

const authenticatedData = {
  user: { id: 'user-123', email: 'owner@example.com' },
  session: { access_token: 'session-token' },
};

function credentials(email = 'owner@example.com', password = 'password123') {
  const formData = new FormData();
  formData.set('email', email);
  formData.set('password', password);
  return formData;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('auth Server Actions', () => {
  it('rejects invalid registration and login input before calling Supabase', async () => {
    await expect(registerAction(credentials('invalid-email', 'short'))).resolves.toMatchObject({
      success: false,
      error: 'Nieprawidłowe dane formularza',
      fieldErrors: {
        email: 'Nieprawidłowy adres e-mail',
        password: 'Hasło musi mieć co najmniej 8 znaków',
      },
    });
    await expect(loginAction(credentials('invalid-email', ''))).resolves.toMatchObject({
      success: false,
      error: 'Nieprawidłowe dane formularza',
      fieldErrors: { email: 'Nieprawidłowy adres e-mail' },
    });

    expect(mockSupabaseAuth.signUp).not.toHaveBeenCalled();
    expect(mockSupabaseAuth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('returns the requested safe destination after successful registration', async () => {
    mockSupabaseAuth.signUp.mockResolvedValue({ data: authenticatedData, error: null });
    const formData = credentials();
    formData.set('redirectTo', '/restaurants/new');

    await expect(registerAction(formData)).resolves.toEqual({
      success: true,
      redirectTo: '/restaurants/new',
    });

    expect(mockSupabaseAuth.signUp).toHaveBeenCalledWith({
      email: 'owner@example.com',
      password: 'password123',
    });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('maps duplicate email registration responses to the documented message', async () => {
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'user_already_exists', message: 'Already exists' },
    });

    await expect(registerAction(credentials())).resolves.toEqual({
      success: false,
      error: 'Konto z tym adresem e-mail już istnieje',
    });
  });

  it('maps unexpected registration errors without exposing provider details', async () => {
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'unexpected_error', message: 'internal provider detail' },
    });

    await expect(registerAction(credentials())).resolves.toEqual({
      success: false,
      error: 'Wystąpił błąd podczas rejestracji. Spróbuj ponownie.',
    });
  });

  it.each([
    ['invalid credentials', 'invalid_credentials', 'Nieprawidłowy adres e-mail lub hasło'],
    [
      'rate-limited requests',
      'over_request_rate_limit',
      'Zbyt wiele nieudanych prób. Spróbuj ponownie za 15 minut.',
    ],
  ])('maps %s login responses', async (_caseName, code, expectedError) => {
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code, message: 'Provider error' },
    });

    await expect(loginAction(credentials())).resolves.toEqual({
      success: false,
      error: expectedError,
    });
  });

  it('maps unexpected login errors without exposing provider details', async () => {
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'unexpected_error', message: 'internal provider detail' },
    });

    await expect(loginAction(credentials())).resolves.toEqual({
      success: false,
      error: 'Wystąpił błąd podczas logowania. Spróbuj ponownie.',
    });
  });

  it('maps a login operation that exceeds five seconds to the timeout message', async () => {
    vi.useFakeTimers();
    mockSupabaseAuth.signInWithPassword.mockImplementation(
      () => new Promise(() => undefined)
    );

    const result = loginAction(credentials());
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(result).resolves.toEqual({
      success: false,
      error: 'Przekroczono limit czasu. Spróbuj ponownie.',
    });
  });

  it('returns the safe destination after successful login', async () => {
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: authenticatedData,
      error: null,
    });

    await expect(
      loginAction(credentials(), 'https://attacker.example/steal-session')
    ).resolves.toEqual({ success: true, redirectTo: '/' });

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('returns an error and does not redirect when logout fails', async () => {
    mockSupabaseAuth.signOut.mockResolvedValue({
      error: { code: 'unexpected_error', message: 'provider detail' },
    });

    await expect(logoutAction()).resolves.toEqual({
      success: false,
      error: 'Wystąpił błąd podczas wylogowania.',
    });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('keeps login navigation non-fatal when legacy-data migration fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setMockCookie('lunch_session_token', 'legacy-session-token');
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: authenticatedData,
      error: null,
    });
    mockSupabaseClient.rpc.mockResolvedValue({
      data: null,
      error: { message: 'migration failed' },
    });

    await expect(loginAction(credentials(), '/add')).resolves.toEqual({
      success: true,
      redirectTo: '/add',
      migrationWarning:
        'Nie udało się przypisać wcześniejszych danych do konta. Skontaktuj się z pomocą techniczną.',
    });

    expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('migrate_session_data', {
      p_session_token: 'legacy-session-token',
      p_user_id: 'user-123',
    });
    expect(mockRedirect).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
