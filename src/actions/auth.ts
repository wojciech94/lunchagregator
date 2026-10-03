'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { buildEmailRedirectTo, sanitizeRedirectTo } from '@/lib/auth';
import {
  MIGRATION_WARNING_MESSAGE,
} from '@/lib/migration-warning';
import { loginSchema, registerSchema } from '@/schemas/auth.schema';

const AUTH_TIMEOUT_MS = 5_000;
const LOGOUT_TIMEOUT_MS = 3_000;

export type AuthActionResult =
  | { success: true; migrationWarning?: string; redirectTo: string }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

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
): Promise<AuthActionResult> {
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
    return {
      success: false,
      error: 'Wystąpił błąd podczas rejestracji. Spróbuj ponownie.',
    };
  }

  if (registration.error) {
    if (registration.error.code === 'user_already_exists') {
      return {
        success: false,
        error: 'Konto z tym adresem e-mail już istnieje',
      };
    }
    console.error('[auth] signUp error:', registration.error);
    return {
      success: false,
      error: 'Wystąpił błąd podczas rejestracji. Spróbuj ponownie.',
    };
  }

  let authenticatedData = registration.data;
  if (!authenticatedData.user || !authenticatedData.session) {
    try {
      const signIn = await withRemainingAuthTime(
        () => supabase.auth.signInWithPassword({ email, password }),
        deadline
      );

      if (signIn.error || !signIn.data.user || !signIn.data.session) {
        if (signIn.error) {
          console.error('[auth] post-registration sign-in error:', signIn.error);
        }
        return {
          success: false,
          error: 'Wystąpił błąd podczas rejestracji. Spróbuj ponownie.',
        };
      }

      authenticatedData = signIn.data;
    } catch (error) {
      if (!(error instanceof AuthOperationTimeoutError)) {
        console.error('[auth] post-registration sign-in threw:', error);
      }
      return {
        success: false,
        error: 'Wystąpił błąd podczas rejestracji. Spróbuj ponownie.',
      };
    }
  }

  const authenticatedUser = authenticatedData.user;
  if (!authenticatedUser || !authenticatedData.session) {
    console.error('[auth] registration completed without an authenticated session');
    return {
      success: false,
      error: 'Wystąpił błąd podczas rejestracji. Spróbuj ponownie.',
    };
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
): Promise<AuthActionResult> {
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
export async function logoutAction(): Promise<AuthActionResult> {
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
