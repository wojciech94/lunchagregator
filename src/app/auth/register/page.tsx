import Link from 'next/link';
import { RegisterForm } from '@/components/auth/RegisterForm';

interface RegisterPageProps {
  searchParams: Promise<{ redirectTo?: string }>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const { redirectTo } = await searchParams;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-lg border bg-card p-8 shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Utwórz konto</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Zarejestruj się, aby zarządzać swoimi restauracjami i ofertami.
          </p>
        </div>

        <RegisterForm redirectTo={redirectTo} />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Masz już konto?{' '}
          <Link
            href="/auth/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Zaloguj się
          </Link>
        </p>
      </div>
    </div>
  );
}
