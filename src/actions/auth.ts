'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import type { AuthResponse } from '@supabase/supabase-js';

/** The `{ user, session }` shape every auth call returns. */
type AuthResponseData = AuthResponse['data'];
import {
  buildEmailRedirectTo,
  isConnectivityError,
  sanitizeRedirectTo,
} from '@/lib/auth';
import {
  MIGRATION_WARNING_MESSAGE,
} from '@/lib/migration-warning';
import { loginSchema, registerSchema } from '@/schemas/auth.schema';

const AUTH_TIMEOUT_MS = 5_000;
const LOGOUT_TIMEOUT_MS = 3_000;

export type AuthFailure = {
  success: false;
  error: string;
  fieldErrors?: Record<string, string>;
};

export type AuthSuccess = {
  success: true;
  migrationWarning?: string;
  redirectTo: string;
};

/**
 * Login and logout always finish with a session or an error, so their callers
 * can rely on `redirectTo` being present.
 */
export type SessionActionResult = AuthSuccess | AuthFailure;

/**
 * Registration has one outcome the others cannot have: the account is created
 * and is waiting on the emailed link. Not an error -- the User has to click it
 * before they can sign in -- but distinct from a redirect, so the form can say
 * so instead of inviting a retry that cannot succeed.
 */
export type RegisterActionResult =
  | AuthSuccess
  | AuthFailure
  | { success: true; pendingEmailConfirmation: true };

/** @deprecated Prefer SessionActionResult or RegisterActionResult. */
export type AuthActionResult = SessionActionResult;

class AuthOperationTimeoutError extends Error {
  constructor() {
    super('Authentication operation timed out');
    this.name = 'AuthOperationTimeoutError';
  }
}

function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new AuthOperationTimeoutError()),
      timeoutMs
    );

    Promise.resolve()
      .then(operation)
      .then(
        (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        (error: unknown) => {
          clearTimeout(timeout);
          reject(error);
        }
      );
  });
}

const REGISTRATION_FAILED =
  'Wystąpił błąd podczas rejestracji. Spróbuj ponownie.';

/**
 * Told apart from a provider rejection on purpose. When the backend cannot be
 * reached, "spróbuj ponownie" invites a retry that may not help, and the User
 * has no way to learn from the UI that the deployment itself is pointing at a
 * backend that is not answering.
 */
const AUTH_UNREACHABLE =
  'Nie udało się połączyć z usługą uwierzytelniania. Spróbuj ponownie za chwilę.';

/**
 * Single place that turns a registration failure into a message.
 *
 * The five call sites this replaces each returned the same string, which is
 * what made an unreachable backend indistinguishable from a rejected password.
 */
function registrationFailure(error: unknown): AuthFailure {
  return {
    success: false,
    error: isConnectivityError(error) ? AUTH_UNREACHABLE : REGISTRATION_FAILED,
  };
}

/**
 * Provider rejections that mean something specific to the person registering.
 * Returns null for anything unrecognised, so the caller keeps the generic
 * message and never passes provider text through to the User.
 */
function mapRegistrationError(error: {
  code?: string | null;
  status?: number;
  message?: string | null;
}): AuthFailure | null {
  if (isAddressTaken(error)) {
    return { success: false, error: 'Konto z tym adresem e-mail już istnieje' };
  }

  if (error.code === 'over_email_send_rate_limit') {
    return {
      success: false,
      error:
        'Zbyt wiele wiadomości z prośbą o potwierdzenie. Spróbuj ponownie za kilka minut.',
    };
  }

  if (error.code === 'over_request_rate_limit') {
    return {
      success: false,
      error: 'Zbyt wiele prób rejestracji. Spróbuj ponownie za kilka minut.',
    };
  }

  if (error.code === 'weak_password') {
    return {
      success: false,
      error: 'Hasło jest zbyt słabe. Użyj dłuższego hasła.',
    };
  }

  return null;
}

/**
 * True when the provider says the address is already registered.
 *
 * A project without duplicate detection reports this as 422 with prose rather
 * than a code, so both shapes are checked.
 *
 * These errors must never be followed by a sign-in attempt. The address
 * belongs to whoever registered it first, so a successful probe would sign
 * that account in -- and someone who typos their email into the registration
 * form would land in another person's account.
 */
function isAddressTaken(error: {
  code?: string | null;
  status?: number;
  message?: string | null;
}): boolean {
  if (error.code === 'user_already_exists') {
    return true;
  }
  return (
    error.status === 422 &&
    typeof error.message === 'string' &&
    /already (been )?registered/i.test(error.message)
  );
}

/**
 * True when sign-in is refused only because the address is unconfirmed.
 *
 * That is not a failure of the attempt: the account exists, and the User has a
 * link to click.
 */
function isPendingEmailConfirmation(error: {
  code?: string | null;
} | null | undefined): boolean {
  return error?.code === 'email_not_confirmed';
}

type PostSignUpProbe =
  | { kind: 'pending' }
  | { kind: 'authenticated'; data: AuthResponseData }
  | { kind: 'failed'; error: unknown };

/**
 * Signs in after a registration that did not return a session, to find out what
 * actually happened.
 *
 * Supabase creates the account before sending the confirmation email. With
 * Confirm email on and SMTP unconfigured, `signUp` therefore returns an *error*
 * while the row exists and awaits confirmation -- a state that looks exactly
 * like a failed registration from the outside.
 *
 * Three outcomes, and all three are real:
 *   - the account is waiting on a link
 *   - the account is already usable, and registration genuinely succeeded
 *   - registration really did fail
 *
 * Only ever called when the address was not reported as taken.
 */
async function probeAfterSignUp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email: string,
  password: string,
  deadline: number
): Promise<PostSignUpProbe> {
  try {
    const signIn = await withRemainingAuthTime(
      () => supabase.auth.signInWithPassword({ email, password }),
      deadline
    );

    if (isPendingEmailConfirmation(signIn.error)) {
      return { kind: 'pending' };
    }
    if (signIn.error || !signIn.data.user || !signIn.data.session) {
      return { kind: 'failed', error: signIn.error };
    }
    return { kind: 'authenticated', data: signIn.data };
  } catch (error) {
    if (!(error instanceof AuthOperationTimeoutError)) {
      console.error('[auth] post-registration sign-in threw:', error);
    }
    return { kind: 'failed', error };
  }
}

function withRemainingAuthTime<T>(
  operation: () => Promise<T>,
  deadline: number
): Promise<T> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    return Promise.reject(new AuthOperationTimeoutError());
  }

  return withTimeout(operation, remainingMs);
}

function fieldErrorsFrom(
  issues: { path: PropertyKey[]; message: string }[]
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === 'string') {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}

/**
 * Attempts to migrate anonymous session data to the authenticated user's account.
 * Migration failure is non-fatal — errors are logged but do not interrupt the auth flow.
 * Returns a non-blocking warning message if migration fails, or null on success/no token.
 */
async function attemptMigration(userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('lunch_session_token')?.value;

  if (!sessionToken) {
    return null;
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('migrate_session_data', {
      p_session_token: sessionToken,
      p_user_id: userId,
    });

    if (error) {
      console.error('[auth] Migration RPC failed:', error);
      return MIGRATION_WARNING_MESSAGE;
    }

    cookieStore.delete('lunch_session_token');
    return null;
  } catch (err) {
    console.error('[auth] Migration unexpected error:', err);
    return MIGRATION_WARNING_MESSAGE;
  }
}

/**
 * Registers a new user and establishes an authenticated session before redirecting.
 */
export async function registerAction(
  formData: FormData
): Promise<RegisterActionResult> {
  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),
  };
  const redirectToParam = formData.get('redirectTo') as string | null;

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: 'Nieprawidłowe dane formularza',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const { email, password } = parsed.data;
  const supabase = await createClient();
  const deadline = Date.now() + AUTH_TIMEOUT_MS;

  let registration;
  // Supabase falls back to the project's Site URL dashboard setting when this
  // is omitted, and that setting defaults to localhost, so a production user
  // would receive a dead link. See NEXT_PUBLIC_SITE_URL in .env.local.example.
  const emailRedirectTo = buildEmailRedirectTo(redirectToParam);
  if (emailRedirectTo === undefined) {
    console.warn(
      '[auth] NEXT_PUBLIC_SITE_URL is unset or malformed; the confirmation email will point at the Supabase Site URL setting instead of this deployment.'
    );
  }

  try {
    registration = await withRemainingAuthTime(
      () =>
        supabase.auth.signUp({
          email,
          password,
          ...(emailRedirectTo ? { options: { emailRedirectTo } } : {}),
        }),
      deadline
    );
  } catch (error) {
    if (!(error instanceof AuthOperationTimeoutError)) {
      console.error('[auth] signUp threw:', error);
    }
    return registrationFailure(error);
  }

  let authenticatedData = registration.data;
  // A session straight from signUp counts: this is the path with Confirm email
  // off, and it needs no probe.
  let signedIn = Boolean(authenticatedData.user && authenticatedData.session);
  let pendingConfirmation = false;
  let probeFailure: unknown;

  const applyProbe = async (): Promise<void> => {
    const probe = await probeAfterSignUp(supabase, email, password, deadline);
    if (probe.kind === 'pending') {
      pendingConfirmation = true;
      return;
    }
    if (probe.kind === 'authenticated') {
      authenticatedData = probe.data;
      signedIn = true;
      return;
    }
    probeFailure = probe.error;
  };

  if (registration.error) {
    if (isPendingEmailConfirmation(registration.error)) {
      // Already told: the account exists and is waiting. No probe needed.
      pendingConfirmation = true;
    } else if (!isAddressTaken(registration.error)) {
      // Never probe after an address-taken error: the account belongs to
      // whoever registered it first, and a successful probe would sign them in.
      await applyProbe();
    }
  } else if (!signedIn) {
    // signUp succeeded but returned no session, which is what Confirm email on
    // looks like from here.
    await applyProbe();
  }

  if (pendingConfirmation) {
    return { success: true, pendingEmailConfirmation: true };
  }

  if (!signedIn && registration.error) {
    // The provider's own wording wins where it has one: a rate limit is more
    // useful to the User than anything the probe can add.
    const mapped = mapRegistrationError(registration.error);
    if (mapped) {
      return mapped;
    }
    console.error('[auth] signUp error:', registration.error);
    return registrationFailure(probeFailure ?? registration.error);
  }

  if (!signedIn) {
    // signUp and the probe both fell short. The probe's error is the more
    // specific one, so it decides whether this is a connectivity problem.
    return registrationFailure(probeFailure);
  }

  const authenticatedUser = authenticatedData.user;
  if (!authenticatedUser || !authenticatedData.session) {
    console.error('[auth] registration completed without an authenticated session');
    return registrationFailure(undefined);
  }

  const destination = sanitizeRedirectTo(redirectToParam);
  const warning = await attemptMigration(authenticatedUser.id);

  return {
    success: true,
    redirectTo: destination,
    ...(warning ? { migrationWarning: warning } : {}),
  };
}

/**
 * Logs in an existing user within the five-second authentication budget.
 */
export async function loginAction(
  formData: FormData,
  redirectTo: string | null = null
): Promise<SessionActionResult> {
  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),
  };
  const redirectToParam =
    redirectTo ?? (formData.get('redirectTo') as string | null);

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: 'Nieprawidłowe dane formularza',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const { email, password } = parsed.data;
  const supabase = await createClient();

  let login;
  try {
    login = await withTimeout(
      () => supabase.auth.signInWithPassword({ email, password }),
      AUTH_TIMEOUT_MS
    );
  } catch (error) {
    if (error instanceof AuthOperationTimeoutError) {
      return {
        success: false,
        error: 'Przekroczono limit czasu. Spróbuj ponownie.',
      };
    }
    console.error('[auth] signInWithPassword threw:', error);
    return {
      success: false,
      error: 'Wystąpił błąd podczas logowania. Spróbuj ponownie.',
    };
  }

  if (login.error) {
    if (login.error.code === 'invalid_credentials') {
      return {
        success: false,
        error: 'Nieprawidłowy adres e-mail lub hasło',
      };
    }
    if (login.error.code === 'over_request_rate_limit') {
      return {
        success: false,
        error: 'Zbyt wiele nieudanych prób. Spróbuj ponownie za 15 minut.',
      };
    }
    if (
      login.error.message?.toLowerCase().includes('timeout') ||
      login.error.message?.toLowerCase().includes('timed out')
    ) {
      return {
        success: false,
        error: 'Przekroczono limit czasu. Spróbuj ponownie.',
      };
    }
    console.error('[auth] signInWithPassword error:', login.error);
    return {
      success: false,
      error: 'Wystąpił błąd podczas logowania. Spróbuj ponownie.',
    };
  }

  if (!login.data.user || !login.data.session) {
    console.error('[auth] signInWithPassword returned without a session');
    return {
      success: false,
      error: 'Wystąpił błąd podczas logowania. Spróbuj ponownie.',
    };
  }

  const destination = sanitizeRedirectTo(redirectToParam);
  const warning = await attemptMigration(login.data.user.id);

  return {
    success: true,
    redirectTo: destination,
    ...(warning ? { migrationWarning: warning } : {}),
  };
}

/**
 * Invalidates the active session within three seconds and redirects on success.
 */
export async function logoutAction(): Promise<SessionActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await withTimeout(
      () => supabase.auth.signOut(),
      LOGOUT_TIMEOUT_MS
    );

    if (error) {
      console.error('[auth] signOut error:', error);
      return {
        success: false,
        error: 'Wystąpił błąd podczas wylogowania.',
      };
    }
  } catch (error) {
    if (!(error instanceof AuthOperationTimeoutError)) {
      console.error('[auth] signOut threw:', error);
    }
    return {
      success: false,
      error: 'Wystąpił błąd podczas wylogowania.',
    };
  }

  redirect('/');
}
