import Link from "next/link";
import { Plus } from "lucide-react";
import { listRestaurants } from "@/actions/restaurants";
import { RestaurantsPage } from "@/components/restaurants/RestaurantsPage";

export default async function RestaurantsListPage() {
  // Fetch initial restaurants server-side (SSR) — no user location available at this point
  const initialData = await listRestaurants({});

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Restauracje
        </h1>
        <Link
          href="/restaurants/new"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-[4px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-[#5e6ad2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="text-base">Dodaj restaurację</span>
        </Link>
      </div>
      <RestaurantsPage initialData={initialData} />
    </div>
  );
}
