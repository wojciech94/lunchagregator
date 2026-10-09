import { getOffers } from "@/actions/offers";
import { OffersPage } from "@/components/offers/OffersPage";
import { parseFiltersFromSearchParams, withDistanceFilter } from "@/lib/filter-url";
import { readStoredLocationCookie } from "@/lib/location";
import { menuToday } from '@/lib/recurring-menu';

interface HomeProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Home({ searchParams }: HomeProps) {
  const [raw, storedLocation] = await Promise.all([searchParams, readStoredLocationCookie()]);

  // The URL is the single source of truth for filters, so the server renders
  // what the link says instead of a default that the client then replaces.
  const { filters, radius } = parseFiltersFromSearchParams(
    new URLSearchParams(toEntries(raw))
  );

  // Location is the other half. It lives in an httpOnly cookie rather than the
  // query string, so it never reaches browser history or a Referer header --
  // but the server can read it, which is what it could never do from
  // localStorage. This is the first render that can honour `sort=distance`.
  const coordinates = storedLocation?.coordinates;

  // A radius alone cannot form a distance filter: the schema needs an origin
  // too, and that is in the cookie.
  const filtersWithDistance = withDistanceFilter(filters, radius, coordinates);

  const result = await getOffers(filtersWithDistance, coordinates);

  const initialData = result.success
    ? result.data
    : { offers: [], total: 0, page: 1, limit: 50, hasMore: false };

  const date = filters.date ?? menuToday();
  // The server does not know the visitor's timezone. An absolute calendar date
  // stays truthful even when "today" differs between the browser and server.
  const dayLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString("pl-PL", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl mb-6">
        Oferty lunchowe na {dayLabel}
      </h1>
      {!result.success && <p role="alert" className="mb-4 text-destructive">Nie udało się pobrać ofert. Spróbuj ponownie.</p>}
      <OffersPage initialData={initialData} />
    </div>
  );
}

/** Next.js hands searchParams over as a promise of a plain record. */
function toEntries(raw: Record<string, string | string[] | undefined>): [string, string][] {
  return Object.entries(raw).flatMap(([key, value]) =>
    Array.isArray(value) ? value.map((v): [string, string] => [key, v]) : value === undefined ? [] : [[key, value]]
  );
}
