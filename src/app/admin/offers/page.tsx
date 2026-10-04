import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { getOrphanOffersAction } from "@/actions/offers";
import { OrphanOfferRow } from "@/components/admin/OrphanOfferRow";
import { Button } from "@/components/ui/button";
import { getAdmin } from "@/lib/auth";

/**
 * The admin panel's one page: every offer with no owner. #55.
 *
 * #54 gave an admin the permission to edit or delete a record nobody owns.
 * Nothing gave them a way to find one, so a stale offer stayed up until somebody
 * ran the right SQL by hand.
 *
 * `notFound()` rather than `redirect('/')` for a non-admin. A redirect confirms
 * the route exists and bounces the reader to a page that has nothing to do with
 * what they asked for; a 404 says less and is the answer Next.js already expects
 * a missing page to give. The route is not a secret -- the nav link below is
 * rendered only for an admin -- but there is no reason to confirm its existence
 * to a prober either.
 *
 * The check is here as well as in `getOrphanOffersAction` and in SQL. Each layer
 * fails differently: the page stops the render, the action stops the fetch, and
 * the function answers a non-admin with zero rows rather than an error. Only the
 * first two produce a refusal a person can read.
 */
export default async function AdminOffersPage() {
  const admin = await getAdmin();

  if (!admin) {
    notFound();
  }

  const result = await getOrphanOffersAction();

  // getOrphanOffersAction has already refused anyone who is not an admin, so
  // reaching here as a failure means the query itself failed. That is not an empty
  // list and must not be rendered as one: an operator told "nothing to reclaim"
  // when the database is unreachable stops checking.
  const offers = result.success ? result.data : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Powrót do listy ofert
      </Link>

      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Oferty bez właściciela</h1>

      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Te oferty są widoczne dla wszystkich, ale nikt nie jest ich właścicielem, więc nikt poza
        administratorem nie może ich poprawić ani usunąć. Popraw danie, uzupełnij restaurację albo
        usuń ofertę, która wygasła.
      </p>

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
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">Nie ma ofert bez właściciela</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Wszystkie oferty mają właściciela. Ta lista jest pusta.
            </p>
          </div>
        </div>
      )}

      {offers !== null && offers.length > 0 && (
        <>
          <p className="mt-6 text-sm text-muted-foreground">
            {offers.length === 1 ? "1 oferta" : `${offers.length} ofert`}
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {offers.map((offer) => (
              <OrphanOfferRow key={offer.id} offer={offer} />
            ))}
          </ul>
        </>
      )}

      <div className="mt-8">
        <Button variant="outline" size="sm" asChild>
          <Link href="/">Wróć do listy</Link>
        </Button>
      </div>
    </div>
  );
}
