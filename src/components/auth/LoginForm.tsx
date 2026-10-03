'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { loginAction } from '@/actions/auth';
import {
  MIGRATION_WARNING_STORAGE_KEY,
} from '@/lib/migration-warning';
import { loginSchema, type LoginInput } from '@/schemas/auth.schema';

export interface LoginFormProps {
  redirectTo?: string;
}

export function LoginForm({ redirectTo }: LoginFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  function onSubmit(data: LoginInput) {
    setServerError(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set('email', data.email);
      formData.set('password', data.password);

      const result = await loginAction(formData, redirectTo ?? null);

      if (!result.success) {
        setServerError(result.error);
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
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-5"
      noValidate
    >
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

      {serverError && (
        <p
          className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2"
          role="alert"
          aria-live="polite"
        >
          {serverError}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? 'Logowanie…' : 'Zaloguj się'}
      </Button>
    </form>
  );
}
