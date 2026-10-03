'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  MIGRATION_WARNING_MESSAGE,
  MIGRATION_WARNING_STORAGE_KEY,
} from '@/lib/migration-warning';

/** Shows the one-time migration failure notice after the auth form redirects. */
export function PostAuthMigrationWarning() {
  const pathname = usePathname();
  const [warning, setWarning] = useState(false);

  useEffect(() => {
    const storedWarning = window.sessionStorage.getItem(
      MIGRATION_WARNING_STORAGE_KEY
    );

    if (storedWarning !== MIGRATION_WARNING_MESSAGE) {
      return;
    }

    window.sessionStorage.removeItem(MIGRATION_WARNING_STORAGE_KEY);
    setWarning(true);
  }, [pathname]);

  if (!warning) {
    return null;
  }

  return (
    <div
      className="mx-auto mt-4 max-w-[1440px] px-4 md:px-6"
      role="alert"
      aria-live="polite"
    >
      <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-600">
        {MIGRATION_WARNING_MESSAGE}
      </p>
    </div>
  );
}
