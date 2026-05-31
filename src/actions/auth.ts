'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { sanitizeRedirectTo } from '@/lib/auth';
import { loginSchema, registerSchema } from '@/schemas/auth.schema';

export type AuthActionResult =
  | { success: true; migrationWarning?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

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
      return 'Nie udało się przypisać wcześniejszych danych do konta. Skontaktuj się z pomocą techniczną.';
    }

    // Delete the session token cookie on successful migration
    cookieStore.delete('lunch_session_token');
    return null;
  } catch (err) {
    console.error('[auth] Migration unexpected error:', err);
    return 'Nie udało się przypisać wcześniejszych danych do konta. Skontaktuj się z pomocą techniczną.';
  }
}

/**
 * Registers a new user account.
 * Validates input with registerSchema, calls supabase.auth.signUp(),
 * attempts session data migration if lunch_session_token cookie exists,
 * and redirects to `/` on success.
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
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as string;
      fieldErrors[field] = issue.message;
    }
    return {
      success: false,
      error: 'Nieprawidłowe dane formularza',
      fieldErrors,
    };
  }

  const { email, password } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    if (error.code === 'user_already_exists') {
      return {
        success: false,
        error: 'Konto z tym adresem e-mail już istnieje',
      };
    }
    // Treat network/timeout errors and all other Supabase errors generically
    console.error('[auth] signUp error:', error);
    return {
      success: false,
      error: 'Wystąpił błąd podczas rejestracji. Spróbuj ponownie.',
    };
  }

  // Attempt migration — non-blocking
  let migrationWarning: string | undefined;
  if (data.user) {
    const warning = await attemptMigration(data.user.id);
    if (warning) migrationWarning = warning;
  }

  if (migrationWarning) {
    // Return warning to the client so it can be displayed; the form will redirect
    return { success: true, migrationWarning };
  }

  const destination = sanitizeRedirectTo(redirectToParam);
  redirect(destination);
}

/**
 * Logs in an existing user.
 * Validates input with loginSchema, calls supabase.auth.signInWithPassword(),
 * handles credential errors, rate limiting, and timeouts per the design error table.
 * Attempts session data migration if lunch_session_token cookie exists.
 * Redirects to sanitized redirectTo (or `/`) on success.
 */
export async function loginAction(
  formData: FormData,
  redirectTo: string | null = null
): Promise<AuthActionResult> {
  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),
  };

  // Allow redirectTo to come from formData if not passed as a parameter
  const redirectToParam =
    redirectTo ?? (formData.get('redirectTo') as string | null);

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as string;
      fieldErrors[field] = issue.message;
    }
    return {
      success: false,
      error: 'Nieprawidłowe dane formularza',
      fieldErrors,
    };
  }

  const { email, password } = parsed.data;
  const supabase = await createClient();

  let data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['data'];
  let error: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['error'];

  try {
    const result = await supabase.auth.signInWithPassword({ email, password });
    data = result.data;
    error = result.error;
  } catch (err) {
    // Network-level timeout or unexpected error
    console.error('[auth] signInWithPassword threw:', err);
    return {
      success: false,
      error: 'Przekroczono limit czasu. Spróbuj ponownie.',
    };
  }

  if (error) {
    if (error.code === 'invalid_credentials') {
      return {
        success: false,
        error: 'Nieprawidłowy adres e-mail lub hasło',
      };
    }
    if (error.code === 'over_request_rate_limit') {
      return {
        success: false,
        error: 'Zbyt wiele nieudanych prób. Spróbuj ponownie za 15 minut.',
      };
    }
    // Check for timeout-like errors by message
    if (
      error.message?.toLowerCase().includes('timeout') ||
      error.message?.toLowerCase().includes('timed out')
    ) {
      return {
        success: false,
        error: 'Przekroczono limit czasu. Spróbuj ponownie.',
      };
    }
    console.error('[auth] signInWithPassword error:', error);
    return {
      success: false,
      error: 'Wystąpił błąd podczas logowania. Spróbuj ponownie.',
    };
  }

  // Attempt migration — non-blocking
  let migrationWarning: string | undefined;
  if (data?.user) {
    const warning = await attemptMigration(data.user.id);
    if (warning) migrationWarning = warning;
  }

  if (migrationWarning) {
    // Return warning to the client so it can be displayed; the form will redirect
    return { success: true, migrationWarning };
  }

  const destination = sanitizeRedirectTo(redirectToParam);
  redirect(destination);
}

/**
 * Logs out the current user.
 * Calls supabase.auth.signOut() and redirects to `/` on success.
 * Returns an error result if sign-out fails (does not redirect).
 */
export async function logoutAction(): Promise<AuthActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('[auth] signOut error:', error);
    return {
      success: false,
      error: 'Wystąpił błąd podczas wylogowania.',
    };
  }

  redirect('/');
}
