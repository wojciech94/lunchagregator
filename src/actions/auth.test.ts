import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mockRedirect,
  mockSupabaseAuth,
  mockSupabaseClient,
  setMockCookie,
} from '../../tests/setup';
import { loginAction, logoutAction, registerAction, resendConfirmationAction } from './auth';

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
  // These tests toggle the configured origin; leaving it set would change how
  // later files in this worker build their redirect.
  delete process.env.NEXT_PUBLIC_SITE_URL;
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

  it('sends no emailRedirectTo when NEXT_PUBLIC_SITE_URL is unset', async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    mockSupabaseAuth.signUp.mockResolvedValue({ data: authenticatedData, error: null });

    await registerAction(credentials());

    // Supabase then falls back to the project Site URL setting, which defaults
    // to localhost. Omitting is deliberate: guessing here is what produced the
    // dead link in the first place.
    expect(mockSupabaseAuth.signUp).toHaveBeenCalledWith({
      email: 'owner@example.com',
      password: 'password123',
    });
  });

  it('sends an absolute emailRedirectTo built from the configured origin', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://app.example.com/';
    mockSupabaseAuth.signUp.mockResolvedValue({ data: authenticatedData, error: null });
    const formData = credentials();
    formData.set('redirectTo', '/restaurants/new');

    await registerAction(formData);

    expect(mockSupabaseAuth.signUp).toHaveBeenCalledWith({
      email: 'owner@example.com',
      password: 'password123',
      options: { emailRedirectTo: 'https://app.example.com/restaurants/new' },
    });
  });

  it('does not let a form-supplied redirectTo escape the configured origin', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://app.example.com';
    mockSupabaseAuth.signUp.mockResolvedValue({ data: authenticatedData, error: null });
    const formData = credentials();
    formData.set('redirectTo', 'https://evil.example/steal');

    await registerAction(formData);

    expect(mockSupabaseAuth.signUp).toHaveBeenCalledWith({
      email: 'owner@example.com',
      password: 'password123',
      options: { emailRedirectTo: 'https://app.example.com/' },
    });
  });

  it('reports pending confirmation instead of a generic failure', async () => {
    // Confirm email is enabled: Supabase creates the account and returns no
    // session, then the follow-up sign-in is refused. That is a success with a
    // next step, not a failure -- retrying cannot help.
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: { id: 'user-123' }, session: null },
      error: null,
    });
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'email_not_confirmed', message: 'Email not confirmed' },
    });

    await expect(registerAction(credentials())).resolves.toEqual({
      success: true,
      pendingEmailConfirmation: true,
    });
  });

  it('does not try to redirect or migrate when confirmation is pending', async () => {
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: { id: 'user-123' }, session: null },
      error: null,
    });
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'email_not_confirmed', message: 'Email not confirmed' },
    });

    await registerAction(credentials());

    // No session means nothing to migrate and nowhere to send the User.
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('still falls back to the generic error for an unconfirmed sign-in failure', async () => {
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: { id: 'user-123' }, session: null },
      error: null,
    });
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'unexpected_error', message: 'provider detail' },
    });

    await expect(registerAction(credentials())).resolves.toEqual({
      success: false,
      error: 'Wystąpił błąd podczas rejestracji. Spróbuj ponownie.',
    });
  });

  it('reports an unreachable backend instead of inviting an immediate retry', async () => {
    // The real shape captured from signUp against a host that does not
    // resolve: status 0, no code, and the diagnostic on `cause`.
    const unreachable = Object.assign(new Error('fetch failed'), {
      status: 0,
      cause: Object.assign(new Error('getaddrinfo ENOTFOUND app.invalid'), {
        code: 'ENOTFOUND',
      }),
    });
    mockSupabaseAuth.signUp.mockRejectedValue(unreachable);

    await expect(registerAction(credentials())).resolves.toEqual({
      success: false,
      error: 'Nie udało się połączyć z usługą uwierzytelniania. Spróbuj ponownie za chwilę.',
    });
  });

  it('reports an unreachable backend when it fails after registration too', async () => {
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: { id: 'user-123' }, session: null },
      error: null,
    });
    mockSupabaseAuth.signInWithPassword.mockRejectedValue(
      Object.assign(new Error('fetch failed'), { status: 0 })
    );

    await expect(registerAction(credentials())).resolves.toEqual({
      success: false,
      error: 'Nie udało się połączyć z usługą uwierzytelniania. Spróbuj ponownie za chwilę.',
    });
  });

  it.each([
    [
      'over_email_send_rate_limit',
      'Zbyt wiele wiadomości z prośbą o potwierdzenie. Spróbuj ponownie za kilka minut.',
    ],
    [
      'over_request_rate_limit',
      'Zbyt wiele prób rejestracji. Spróbuj ponownie za kilka minut.',
    ],
    ['weak_password', 'Hasło jest zbyt słabe. Użyj dłuższego hasła.'],
  ])('maps the %s registration response', async (code, expectedError) => {
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code, message: 'Provider error' },
    });

    await expect(registerAction(credentials())).resolves.toEqual({
      success: false,
      error: expectedError,
    });
  });

  it('recognises a duplicate email reported as 422 prose rather than a code', async () => {
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: {
        code: undefined,
        status: 422,
        message: 'User already registered',
      },
    });

    await expect(registerAction(credentials())).resolves.toEqual({
      success: false,
      error: 'Konto z tym adresem e-mail już istnieje',
    });
  });

  it('reports pending confirmation when signUp errors because the email could not be sent', async () => {
    // The production case: Supabase creates the account before sending, so with
    // Confirm email on and SMTP unconfigured signUp returns an error while the
    // row exists and is awaiting confirmation.
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Error sending confirmation email', status: 500 },
    });
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'email_not_confirmed', message: 'Email not confirmed' },
    });

    await expect(registerAction(credentials())).resolves.toEqual({
      success: true,
      pendingEmailConfirmation: true,
    });
  });

  it('treats signUp reporting email_not_confirmed as pending, not failure', async () => {
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'email_not_confirmed', message: 'Email not confirmed' },
    });

    await expect(registerAction(credentials())).resolves.toEqual({
      success: true,
      pendingEmailConfirmation: true,
    });
  });

  it('does not offer an inbox that will stay empty on a rate limit', async () => {
    // The probe must not turn "no email will be sent" into "check your inbox".
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'over_request_rate_limit', message: 'Too many requests' },
    });
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'over_request_rate_limit', message: 'Too many requests' },
    });

    await expect(registerAction(credentials())).resolves.toEqual({
      success: false,
      error: 'Zbyt wiele prób rejestracji. Spróbuj ponownie za kilka minut.',
    });
  });

  it('does not offer an inbox that will stay empty on an email-send rate limit', async () => {
    // The provider refused to send the confirmation mail, so the account may
    // exist and be awaiting confirmation -- and the probe would then report
    // `pending`, putting the User on an inbox screen for a message that is not
    // coming. The rate-limit message is already specific, so it wins.
    //
    // The test above covers `over_request_rate_limit`, which is a different
    // code: it limits sign-up attempts generally, not mail delivery.
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'over_email_send_rate_limit', message: 'Email rate limit exceeded' },
    });
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'email_not_confirmed', message: 'Email not confirmed' },
    });

    await expect(registerAction(credentials())).resolves.toEqual({
      success: false,
      error: 'Zbyt wiele wiadomości z prośbą o potwierdzenie. Spróbuj ponownie za kilka minut.',
    });

    // And the probe is not reached at all.
    expect(mockSupabaseAuth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('recovers the session when signUp errors but the account is usable', async () => {
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Error sending confirmation email', status: 500 },
    });
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: authenticatedData,
      error: null,
    });

    await expect(registerAction(credentials())).resolves.toEqual({
      success: true,
      redirectTo: '/',
    });
  });

  it('never signs in after an address-taken error', async () => {
    // Signing in here would authenticate whoever owns the address. A typo in
    // the registration form must not land the User in another account.
    for (const error of [
      { code: 'user_already_exists', message: 'User already registered' },
      { code: undefined, status: 422, message: 'User already registered' },
    ]) {
      vi.clearAllMocks();
      mockSupabaseAuth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error,
      });
      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: authenticatedData,
        error: null,
      });

      await expect(registerAction(credentials())).resolves.toEqual({
        success: false,
        error: 'Konto z tym adresem e-mail już istnieje',
      });

      expect(mockSupabaseAuth.signInWithPassword).not.toHaveBeenCalled();
    }
  });

  describe('resendConfirmationAction', () => {
  function emailForm(address = 'owner@example.com'): FormData {
    const formData = new FormData();
    formData.set('email', address);
    return formData;
  }

  it('asks the provider to resend for the given address only', async () => {
    await expect(resendConfirmationAction(emailForm())).resolves.toEqual({
      success: true,
    });
    expect(mockSupabaseAuth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'owner@example.com',
    });
  });

  it('rejects a malformed address without calling the provider', async () => {
    await expect(resendConfirmationAction(emailForm('nope'))).resolves.toMatchObject({
      success: false,
      error: 'Nieprawidłowy adres e-mail',
    });
    expect(mockSupabaseAuth.resend).not.toHaveBeenCalled();
  });

  it('does not claim a message was sent when the provider refuses', async () => {
    mockSupabaseAuth.resend.mockResolvedValue({
      data: {},
      error: { code: 'unexpected_error', message: 'provider detail' },
    });

    const result = await resendConfirmationAction(emailForm());

    expect(result.success).toBe(false);
    // Provider detail must not leak, and "spróbuj ponownie" must not appear
    // where it would imply the mail went out.
    expect(result).toEqual({
      success: false,
      error: 'Nie udało się wysłać ponownie. Spróbuj ponownie za chwilę.',
    });
  });

  it('gives a rate limit its own wording, since it is the likely failure here', async () => {
    mockSupabaseAuth.resend.mockResolvedValue({
      data: {},
      error: { code: 'over_email_send_rate_limit', message: 'Too many emails' },
    });

    await expect(resendConfirmationAction(emailForm())).resolves.toEqual({
      success: false,
      error:
        'Zbyt wiele wiadomości z prośbą o potwierdzenie. Spróbuj ponownie za kilka minut.',
    });
  });

  it('reports an unreachable backend rather than a send failure', async () => {
    mockSupabaseAuth.resend.mockRejectedValue(
      Object.assign(new Error('fetch failed'), {
        status: 0,
        cause: Object.assign(new Error('getaddrinfo ENOTFOUND app.invalid'), {
          code: 'ENOTFOUND',
        }),
      })
    );

    await expect(resendConfirmationAction(emailForm())).resolves.toEqual({
      success: false,
      error: 'Nie udało się połączyć z usługą uwierzytelniania. Spróbuj ponownie za chwilę.',
    });
  });

  it('never discloses whether an address is registered', async () => {
    // Measured against the local stack: Supabase answers POST /auth/v1/resend
    // with 200 {} for an unregistered address exactly as it does for a
    // registered one, so the provider is not an existence oracle and this
    // action must not become one either.
    //
    // What is under this action's control is the wording, so that is what is
    // asserted: no failure message may name the address or talk about accounts.
    const wording = [
      { code: 'unexpected_error', message: 'User not found' },
      { code: 'over_email_send_rate_limit', message: 'Too many emails' },
    ];

    for (const error of wording) {
      mockSupabaseAuth.resend.mockResolvedValue({ data: {}, error });
      const result = await resendConfirmationAction(emailForm('nobody@example.com'));

      const text = result.success ? '' : result.error;
      expect(text).not.toContain('nobody@example.com');
      expect(text.toLowerCase()).not.toMatch(/istnieje|nie ma konta|zarejestrowan/);
    }
  });

  it('reports success for an unregistered address exactly as the provider does', async () => {
    // The provider answers 200 for unknown addresses, so claiming otherwise
    // would mean inventing an answer the User cannot act on.
    mockSupabaseAuth.resend.mockResolvedValue({ data: {}, error: null });

    await expect(
      resendConfirmationAction(emailForm('nobody-here@example.test'))
    ).resolves.toEqual({ success: true });
  });
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
