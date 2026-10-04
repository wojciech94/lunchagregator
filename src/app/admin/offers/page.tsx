import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { listAdminOffers } from "@/actions/admin";
import { OrphanOfferRow } from "@/components/admin/OrphanOfferRow";
import { OrphanOnlyToggle, isOrphanOnly } from "@/components/admin/OrphanOnlyToggle";
import { getAdmin } from "@/lib/auth";

/**
 * Offers, either every one of them or only the ones nobody owns. #55, #54.
 *
 * #54 gave an admin the permission to edit or delete a record nobody owns.
 * Nothing gave them a way to find one, so a stale offer stayed up until somebody
 * ran the right SQL by hand.
 *
 * The default is *everything*, not the orphans: an operator working a queue also
 * has to remove the record that is legitimately present but no longer wanted,
 * and hiding those behind a checkbox meant two places to look. Orphans are the
 * filter, not the page.
 *
 * The admin check is in `/admin/layout.tsx` now. It was here as well, and
 * repeating it per tab is how the two copies drift apart.
 */
export default async function AdminOffersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Redundant with the layout guard, and kept deliberately: the layout is a
  // route segment, and a page reached another way should not depend on it.
  if (!(await getAdmin())) {
    notFound();
  }

  const params = await searchParams;
  const orphanOnly = isOrphanOnly(params);
  const result = await listAdminOffers({ orphanOnly });

  // Null rows mean the query failed, which is not an empty list: an operator
  // told "nothing to reclaim" when the database is unreachable stops checking.
  const offers = result.rows;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {orphanOnly ? "Oferty bez właściciela" : "Oferty"}
      </h1>

      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        {orphanOnly
          ? "Te oferty są widoczne dla wszystkich, ale nikt nie jest ich właścicielem, więc nikt poza administratorem nie może ich poprawić ani usunąć."
          : "Wszystkie oferty. Włącz filtr, aby zobaczyć tylko te bez właściciela — to są te, których nikt nie może już poprawić."}
      </p>

      <OrphanOnlyToggle href="/admin/offers" checked={orphanOnly} subject="oferty" />

      {offers === null && (
        <div
          className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
          role="alert"
        >
          <p className="text-sm text-destructive">
            Nie udało się pobrać listy ofert. Spróbuj ponownie za chwilę.
          </p>
        </div>
      )}

      {offers !== null && offers.length === 0 && (
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-border bg-card p-6">
          <CheckCircle2
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-medium">
              {orphanOnly ? "Nie ma ofert bez właściciela" : "Nie ma ofert"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {orphanOnly
                ? "Wszystkie oferty mają właściciela."
                : "Ta lista jest pusta."}
            </p>
          </div>
        </div>
      )}

      {offers !== null && offers.length > 0 && (
        <>
          <p className="mt-6 text-sm text-muted-foreground">
            {offers.length === 1 ? "1 oferta" : `${offers.length} ofert`}
            {result.partial && ` z ${result.total} łącznie`}
          </p>
          {result.partial && (
            <p className="mt-1 text-xs text-muted-foreground">
              To pierwsza strona. Pełna lista jest na stronie publicznej.
            </p>
          )}
          <ul className="mt-3 flex flex-col gap-3">
            {offers.map((offer) => (
              <OrphanOfferRow key={offer.id} offer={offer} />
            ))}
          </ul>
        </>
      )}

      <div className="mt-8">
        <Link
          href="/"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-primary"
        >
          Wróć do listy
        </Link>
      </div>
    </div>
  );
}