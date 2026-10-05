import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { listAdminRestaurants } from "@/actions/admin";
import { OrphanOnlyToggle } from "@/components/admin/OrphanOnlyToggle";
import { isOrphanOnly } from "@/lib/admin-filters";
import { DeleteRestaurantButton } from "@/components/restaurants/DeleteRestaurantButton";
import { getAdmin } from "@/lib/auth";

/**
 * Restaurants, either every one of them or only the ones nobody owns.
 *
 * The restaurant half of what `/admin/offers` does for offers. `restaurants`
 * carries the same nullable `user_id` and the same `ON DELETE SET NULL`, so an
 * account deleted leaves a restaurant behind that nobody owns either -- and
 * unlike an offer, a restaurant has no fallback rendering of its name.
 */
export default async function AdminRestaurantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await getAdmin())) {
    notFound();
  }

  const params = await searchParams;
  const orphanOnly = isOrphanOnly(params);
  const result = await listAdminRestaurants({ orphanOnly });
  const restaurants = result.rows;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {orphanOnly ? "Restauracje bez właściciela" : "Restauracje"}
      </h1>

      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        {orphanOnly
          ? "Te restauracje mają wpis w publicznej liście, ale nikt nie nimi nie zarządza. Powstały tak, gdy konto właściciela zostało usunięte."
          : "Wszystkie restauracje. Włącz filtr, aby zobaczyć tylko te bez właściciela."}
      </p>

      <OrphanOnlyToggle
        href="/admin/restaurants"
        checked={orphanOnly}
        subject="restauracje"
      />

      {restaurants !== null && result.partial && (
        <p className="mt-2 text-xs text-muted-foreground">
          To pierwsza strona z {result.total} restauracji. Pełna lista jest na
          stronie publicznej.
        </p>
      )}

      {restaurants === null && (
        <div
          className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
          role="alert"
        >
          <p className="text-sm text-destructive">
            Nie udało się pobrać listy restauracji. Spróbuj ponownie za chwilę.
          </p>
        </div>
      )}

      {restaurants !== null && restaurants.length === 0 && (
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-border bg-card p-6">
          <CheckCircle2
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">
            {orphanOnly
              ? "Wszystkie restauracje mają właściciela."
              : "Ta lista jest pusta."}
          </p>
        </div>
      )}

      {restaurants !== null && restaurants.length > 0 && (
        <ul className="mt-6 flex flex-col gap-3">
          {restaurants.map((restaurant) => (
            <li
              key={restaurant.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <Link
                  href={`/restaurants/${restaurant.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {restaurant.name}
                </Link>
                {restaurant.address && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {restaurant.address}
                  </p>
                )}
                {!restaurant.userId && (
                  <p className="mt-1 text-sm text-destructive">
                    Brak właściciela
                  </p>
                )}
              </div>

              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/restaurants/${restaurant.id}/edit`}
                  className="inline-flex items-center rounded-[4px] border border-muted-foreground/30 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Edytuj
                </Link>
                <DeleteRestaurantButton
                  restaurant={{
                    id: restaurant.id,
                    name: restaurant.name,
                    address: restaurant.address ?? null,
                    hasOwner: restaurant.userId !== null && restaurant.userId !== undefined,
                    activeOffersCount: restaurant.activeOffersCount ?? 0,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
