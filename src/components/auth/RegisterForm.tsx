'use client';

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@/schemas/auth.schema';
import { registerAction } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';

export interface RegisterFormProps {
  redirectTo?: string;
}

export function RegisterForm({ redirectTo }: RegisterFormProps) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [migrationWarning, setMigrationWarning] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  function onSubmit(data: RegisterInput) {
    setServerError(null);
    setMigrationWarning(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set('email', data.email);
      formData.set('password', data.password);
      if (redirectTo) {
        formData.set('redirectTo', redirectTo);
      }

      const result = await registerAction(formData);

      // registerAction redirects on success (no migration warning), so we only
      // reach here on failure or when there is a non-blocking migration warning.
      if (result && !result.success) {
        setServerError(result.error);
      } else if (result && result.success && result.migrationWarning) {
        // Migration failed but auth succeeded — show warning then redirect
        setMigrationWarning(result.migrationWarning);
        setTimeout(() => {
          window.location.href = redirectTo ?? '/';
        }, 3000);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="email">Adres e-mail</Label>
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
          <p id="email-error" className="text-sm text-destructive" role="alert">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="password">Hasło</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          placeholder="Minimum 8 znaków"
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

      {serverError && (
        <p className="text-sm text-destructive" role="alert">
          {serverError}
        </p>
      )}

      {migrationWarning && (
        <p className="text-sm text-amber-600 rounded-md border border-amber-300 bg-amber-50 px-3 py-2" role="alert" aria-live="polite">
          {migrationWarning}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Rejestrowanie…' : 'Zarejestruj się'}
      </Button>
    </form>
  );
}
