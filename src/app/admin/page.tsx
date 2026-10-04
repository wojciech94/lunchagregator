import { redirect } from 'next/navigation';

/**
 * `/admin` is a container, not a page.
 *
 * The guard lives in `layout.tsx`, which this redirect runs *before* -- so an
 * unauthenticated visitor briefly reaches the layout's `notFound()` rather than
 * a redirect loop. Pointing the bare path at a real tab keeps the tab strip as
 * the only thing that decides where someone lands.
 */
export default function AdminIndexPage() {
  redirect('/admin/offers');
}