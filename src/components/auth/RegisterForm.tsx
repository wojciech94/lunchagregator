'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@/schemas/auth.schema';
import { registerAction } from '@/actions/auth';
import {
  MIGRATION_WARNING_STORAGE_KEY,
} from '@/lib/migration-warning';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface RegisterFormProps {
  redirectTo?: string;
}

export function RegisterForm({ redirectTo }: RegisterFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<string | null>(
    null
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  function onSubmit(data: RegisterInput) {
    setServerError(null);
    setAwaitingConfirmation(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set('email', data.email);
      formData.set('password', data.password);
      if (redirectTo) {
        formData.set('redirectTo', redirectTo);
      }

      const result = await registerAction(formData);

      if (!result.success) {
        setServerError(result.error);
        return;
      }

      if ('pendingEmailConfirmation' in result) {
        setAwaitingConfirmation(data.email);
        return;
      }

      if (result.migrationWarning) {
        window.sessionStorage.setItem(
          MIGRATION_WARNING_STORAGE_KEY,
          result.migrationWarning
        );
      }

      router.replace(result.redirectTo);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {awaitingConfirmation && (
        <div
          className="rounded-lg border border-border bg-muted/50 p-4 text-sm"
          role="status"
          data-testid="awaiting-confirmation"
        >
          <p className="font-medium">Sprawdź skrzynkę</p>
          <p className="mt-1 text-muted-foreground">
            Wysłaliśmy link potwierdzający na adres {awaitingConfirmation}.
            Konto zostanie aktywne po kliknięciu w niego.
          </p>
        </div>
      )}

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

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Rejestrowanie…' : 'Zarejestruj się'}
      </Button>
    </form>
  );
}
