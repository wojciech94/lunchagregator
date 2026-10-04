import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdmin } from '@/lib/auth';

/**
 * The admin area's guard and its navigation, once.
 *
 * This used to live in `/admin/offers`'s page body, which meant adding a tab
 * meant repeating the check and hoping the second copy stayed in step. The check
 * is cheap; the drift is not.
 *
 * `notFound()` rather than a redirect: a redirect confirms the route exists and
 * then lands the reader somewhere unrelated to what they asked for. The route is
 * not a secret -- the links below are rendered for admins only -- but a 404 says
 * less than an admission.
 */

const TABS = [
  { href: '/admin/offers', label: 'Oferty' },
  { href: '/admin/restaurants', label: 'Restauracje' },
  { href: '/admin/logs', label: 'Logi' },
] as const;

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!(await getAdmin())) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        Powrót do listy ofert
      </Link>

      <nav aria-label="Sekcje administracji" className="mb-6 border-b border-border">
        <ul className="flex gap-2 -mb-px">
          {TABS.map((tab) => (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className="inline-block border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {children}
    </div>
  );
}