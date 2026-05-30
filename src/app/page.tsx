import { getOffers } from "@/actions/offers";
import { OffersPage } from "@/components/offers/OffersPage";

export default async function Home() {
  // Fetch today's offers server-side (SSR) — no user location available at this point
  const result = await getOffers({ sortBy: "newest" });

  const initialData = result.success
    ? result.data
    : { offers: [], total: 0, page: 1, limit: 20, hasMore: false };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl mb-6">
        Oferty lunchowe na dziś
      </h1>
      <OffersPage initialData={initialData} />
    </div>
  );
}
