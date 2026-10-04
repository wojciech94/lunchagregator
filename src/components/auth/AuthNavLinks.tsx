'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Sign-in and registration links that remember where the User was.
 *
 * Requirement 2.13: filters survive authentication, so returning to a filtered
 * listing is not the same as returning to an unfiltered one. The auth pages
 * already accept `?redirectTo=` and pass it through `sanitizeRedirectTo`, which
 * accepts any internal path including its query -- so carrying the current
 * address across is all this needs to do.
 *
 * A client component because the root layout cannot see `searchParams`, and
 * the layout is where these links live.
 */
export function AuthNavLinks() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = searchParams.toString();
  const returnTo = query ? `${pathname}?${query}` : pathname;
  const suffix = `redirectTo=${encodeURIComponent(returnTo)}`;

  const className =
    'rounded-[4px] px-3 py-2 text-sm font-medium text-[#62666d] hover:text-primary transition-colors min-h-[44px] flex items-center';

  return (
    <>
      <Link href={`/auth/login?${suffix}`} className={className}>
        Zaloguj się
      </Link>
      <Link href={`/auth/register?${suffix}`} className={className}>
        Zarejestruj się
      </Link>
    </>
  );
}