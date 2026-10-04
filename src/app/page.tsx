import { getOffers } from "@/actions/offers";
import { OffersPage } from "@/components/offers/OffersPage";

export default async function Home() {
  // Today's offers, server-side. There is no user location at this point, so no
  // sortBy is passed on purpose: get_offers_filtered falls back to alphabetical
  // by restaurant name when it has no origin, which is Requirement 1.2.
  //
  // This used to pass `sortBy: "newest"`, which meant the first paint was
  // newest-first for every visitor whose location had not resolved -- and SSR is
  // the first paint, so 1.2 was violated on arrival rather than after a fetch.
  // The client re-requests with `sortBy: "distance"` once coordinates arrive, at
  // which point Requirement 1.1 takes over.
  const result = await getOffers({});

  const initialData = result.success
    ? result.data
    // The limit here is what the caller believes it got. It matches the
    // service's own default, where the fallback said 20 against a service that
    // returns 50, so a failed SSR pass produced a page that disagreed with its
    // own pagination.
    : { offers: [], total: 0, page: 1, limit: 50, hasMore: false };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl mb-6">
        Oferty lunchowe na dziś
      </h1>
      <OffersPage initialData={initialData} />
    </div>
  );
}
