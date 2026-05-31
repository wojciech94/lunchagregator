'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { loginAction } from '@/actions/auth';
import { loginSchema, type LoginInput } from '@/schemas/auth.schema';

// ============================================================================
// Types
// ============================================================================

export interface LoginFormProps {
  redirectTo?: string;
}

// ============================================================================
// Component
// ============================================================================

export function LoginForm({ redirectTo }: LoginFormProps) {
  const [isPending, startTransition] = React.useTransition();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [migrationWarning, setMigrationWarning] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  function onSubmit(data: LoginInput) {
    setServerError(null);
    setMigrationWarning(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set('email', data.email);
      formData.set('password', data.password);

      const result = await loginAction(formData, redirectTo ?? null);

      // loginAction redirects on success (no migration warning), so we only
      // reach here on failure or when there is a non-blocking migration warning.
      if (!result.success) {
        setServerError(result.error);
      } else if (result.success && result.migrationWarning) {
        // Migration failed but auth succeeded — show warning then redirect
        setMigrationWarning(result.migrationWarning);
        const destination = redirectTo ?? '/';
        setTimeout(() => {
          window.location.href = destination;
        }, 3000);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-5"
      noValidate
    >
      {/* Email field */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">
          Adres e-mail
          <span className="text-destructive ml-0.5" aria-hidden="true">*</span>
        </Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="twoj@email.pl"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
          disabled={isPending}
          {...register('email')}
        />
        {errors.email && (
          <p
            id="email-error"
            className="text-sm text-destructive"
            role="alert"
          >
            {errors.email.message}
          </p>
        )}
      </div>

      {/* Password field */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">
          Hasło
          <span className="text-destructive ml-0.5" aria-hidden="true">*</span>
        </Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? 'password-error' : undefined}
          disabled={isPending}
          {...register('password')}
        />
        {errors.password && (
          <p
            id="password-error"
            className="text-sm text-destructive"
            role="alert"
          >
            {errors.password.message}
          </p>
        )}
      </div>

      {/* Server-returned error */}
      {serverError && (
        <p
          className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2"
          role="alert"
          aria-live="polite"
        >
          {serverError}
        </p>
      )}

      {/* Non-blocking migration warning */}
      {migrationWarning && (
        <p
          className="text-sm text-amber-600 rounded-md border border-amber-300 bg-amber-50 px-3 py-2"
          role="alert"
          aria-live="polite"
        >
          {migrationWarning}
        </p>
      )}

      {/* Submit */}
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? 'Logowanie…' : 'Zaloguj się'}
      </Button>
    </form>
  );
}
