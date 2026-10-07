import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Plus } from "lucide-react";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTodayDate } from "@/services/offers";
import {
  groupOffersByRestaurant,
  groupUnlinkedByName,
  UNLINKED_GROUP_KEY,
  type GroupableOffer,
} from "@/lib/offer-grouping";
import { RenewMenuButton } from "@/components/my-offers/RenewMenuButton";
import { AssignRestaurantControl } from "@/components/my-offers/AssignRestaurantControl";
import { cn } from "@/lib/utils";

export const metadata = { title: "Moje oferty — Lunch Agregator" };

// ============================================================================
// Types + helpers
// ============================================================================

interface MyOfferRow {
  id: string;
  dish_name: string;
  price: number;
  restaurant_id: string | null;
  restaurant_name: string;
  available_date: string;
}

/** Nominative counts: 1 oferta, 2–4 oferty, 5+ ofert (except 12–14). */
function offersPlural(count: number): string {
  if (count === 1) return "oferta";
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
    return "oferty";
  }
  return "ofert";
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "short",
  });
}

/** One offer row, shared by the linked groups and the bucket's sub-groups.
 *
 *  Link conventions (#78): a **standalone text action** — this „Edytuj", the
 *  admin's „Wróć do listy" — is permanently underlined; a link **inline in a
 *  text line** (a dish title, an external URL) underlines on hover. Color by
 *  role: primary for forward actions, muted for going back.
 */
function OfferRow({ row }: { row: MyOfferRow }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-foreground truncate">{row.dish_name}</p>
        <p className="text-xs text-muted-foreground">
          {formatDate(row.available_date)} · {row.price.toFixed(2)} PLN
        </p>
      </div>
      <Link
        href={`/offers/${row.id}/edit`}
        className="text-sm text-primary underline underline-offset-4 hover:text-primary/80 shrink-0 min-h-[44px] flex items-center"
      >
        Edytuj
      </Link>
    </li>
  );
}

// ============================================================================
// Page
// ============================================================================

/**
 * "Moje oferty" (Req 8.4, #71): the User's own offers, grouped per
 * restaurant, split into nadchodzące and wygasłe. The tab lives in the URL
 * as the single source of truth (Req 2.9) and every section renders on the
 * server's first paint.
 *
 * The expired tab is where the freshness loop lives: linked groups get the
 * one-click renewal, restaurants flagged as "menu tygodniowe" surface
 * first, and the name-only legacy rows land in the shared "bez restauracji"
 * bucket with the honest re-add hint (Req 8.9).
 */
export default async function MyOffersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getUser();

  // Req 8.8: a Visitor is returned here after sign-in, filters intact --
  // the same contract the filtered listing keeps (Req 2.13).
  if (!user) {
    redirect("/auth/login?redirectTo=/my-offers");
  }

  const { tab: rawTab } = await searchParams;
  const tab = rawTab === "expired" ? "expired" : "upcoming";

  const supabase = await createClient();
  const today = getTodayDate();

  const [upcomingResult, expiredResult] = await Promise.all([
    supabase
      .from("lunch_offers")
      .select(
        "id, dish_name, price, restaurant_id, restaurant_name, available_date"
      )
      .eq("user_id", user.id)
      .gte("available_date", today)
      .order("available_date", { ascending: true })
      .limit(50),
    supabase
      .from("lunch_offers")
      .select(
        "id, dish_name, price, restaurant_id, restaurant_name, available_date"
      )
      .eq("user_id", user.id)
      .lt("available_date", today)
      .order("available_date", { ascending: false })
      .limit(50),
  ]);

  const rows = ((tab === "upcoming" ? upcomingResult.data : expiredResult.data) ??
    []) as MyOfferRow[];

  const rowById = new Map(rows.map((row) => [row.id, row]));
  const groups = groupOffersByRestaurant(
    rows.map(
      (row): GroupableOffer => ({
        id: row.id,
        restaurantId: row.restaurant_id,
        restaurantName: row.restaurant_name,
        availableDate: row.available_date,
      })
    )
  );

  // Req 8.7: flagged restaurants surface first on the expired tab. The flags
  // are read once, for this tab's linked groups only.
  const flags = new Map<string, boolean>();
  if (tab === "expired") {
    const linkedIds = groups
      .map((group) => group.restaurantId)
      .filter((id): id is string => id !== null);
    if (linkedIds.length > 0) {
      const { data: restaurantRows } = await supabase
        .from("restaurants")
        .select("id, menu_recurs_weekly")
        .in("id", linkedIds);
      for (const row of restaurantRows ?? []) {
        flags.set(row.id as string, row.menu_recurs_weekly as boolean);
      }
    }
    groups.sort((a, b) => {
      const aFlagged = a.restaurantId !== null && (flags.get(a.restaurantId) ?? false);
      const bFlagged = b.restaurantId !== null && (flags.get(b.restaurantId) ?? false);
      if (aFlagged !== bFlagged) return aFlagged ? -1 : 1;
      return 0;
    });
  }

  const isEmpty = groups.length === 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Moje oferty</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Twoje oferty pogrupowane po restauracjach. Wygasłe menu wznowisz
          jednym kliknięciem.
        </p>
      </div>

      {/* Tabs — the URL is the single source of truth (Req 2.9) */}
      <div className="mb-6 flex gap-2" role="tablist">
        {(
          [
            { key: "upcoming", label: "Nadchodzące", href: "/my-offers?tab=upcoming" },
            { key: "expired", label: "Wygasłe", href: "/my-offers?tab=expired" },
          ] as const
        ).map((entry) => (
          <Link
            key={entry.key}
            href={entry.href}
            role="tab"
            aria-selected={tab === entry.key}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium min-h-[44px] flex items-center border transition-colors",
              tab === entry.key
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {entry.label}
          </Link>
        ))}
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="rounded-md border border-border bg-card p-8 text-center">
          <CalendarDays className="size-10 text-muted-foreground mx-auto" aria-hidden="true" />
          <p className="mt-3 text-sm text-foreground">
            {tab === "upcoming"
              ? "Brak nadchodzących ofert."
              : "Brak wygasłych ofert."}
          </p>
          {tab === "upcoming" && (
            <Link
              href="/add"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-[#5e6ad2] min-h-[44px]"
            >
              <Plus className="size-4" aria-hidden="true" />
              Dodaj ofertę
            </Link>
          )}
        </div>
      )}

      {/* Groups */}
      <div className="flex flex-col gap-5">
        {groups.map((group) => {
          const isFlagged =
            group.restaurantId !== null && (flags.get(group.restaurantId) ?? false);
          return (
            <section
              key={group.key}
              className={cn(
                "rounded-md border bg-card p-5",
                isFlagged ? "border-primary/40" : "border-border"
              )}
              aria-label={group.name}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-foreground truncate">
                    {group.name}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {group.offers.length} {offersPlural(group.offers.length)}
                  </p>
                </div>
                {tab === "expired" && group.restaurantId !== null && (
                  <RenewMenuButton
                    restaurantId={group.restaurantId}
                    restaurantName={group.name}
                    hasWeeklyFlag={isFlagged}
                  />
                )}
              </div>

              {group.key === UNLINKED_GROUP_KEY ? (
                <div className="mt-4 flex flex-col gap-4">
                  <p className="text-xs text-muted-foreground">
                    Oferty bez restauracji, pogrupowane po nazwie z materiału.
                    Jedno przypisanie obejmuje całą grupę — po nim znikną stąd
                    i pojawią się jako zwykła restauracja z przyciskiem
                    wznowienia.
                  </p>
                  {groupUnlinkedByName(group.offers).map((sub) => (
                    <div key={sub.name} className="rounded-md border border-border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-foreground truncate">
                            {sub.name}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {sub.offers.length}{" "}
                            {offersPlural(sub.offers.length)} ·{" "}
                            {formatDate(sub.offers[0].availableDate)} –{" "}
                            {formatDate(
                              sub.offers[sub.offers.length - 1].availableDate
                            )}
                          </p>
                        </div>
                        <AssignRestaurantControl
                          offerIds={sub.offers.map((o) => o.id)}
                          snapshotName={sub.name}
                        />
                      </div>
                      <ul className="mt-3 divide-y divide-border">
                        {sub.offers.map((groupOffer) => {
                          const row = rowById.get(groupOffer.id);
                          return row ? <OfferRow key={row.id} row={row} /> : null;
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <ul className="mt-4 divide-y divide-border">
                  {group.offers.map((groupOffer) => {
                    const row = rowById.get(groupOffer.id);
                    return row ? <OfferRow key={row.id} row={row} /> : null;
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
