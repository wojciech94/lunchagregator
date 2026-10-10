import Link from "next/link";
import { Plus } from "lucide-react";
import { listRestaurants } from "@/actions/restaurants";
import { RestaurantsPage } from "@/components/restaurants/RestaurantsPage";
import { Button } from "@/components/ui/button";

export default async function RestaurantsListPage() {
  // Fetch initial restaurants server-side (SSR) — no user location available at this point
  const initialData = await listRestaurants({});

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Restauracje
        </h1>
        <Button asChild>
          <Link href="/restaurants/new">
            <Plus data-icon="inline-start" aria-hidden="true" />
            Dodaj restaurację
          </Link>
        </Button>
      </div>
      <RestaurantsPage initialData={initialData} />
    </div>
  );
}
