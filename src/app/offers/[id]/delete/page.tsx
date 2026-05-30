"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOfferById, deleteOfferAction } from "@/actions/offers";
import { ensureSessionToken } from "@/actions/session";
import type { LunchOffer } from "@/types/offers";

interface DeleteOfferPageProps {
  params: Promise<{ id: string }>;
}

type LoadState =
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "ready"; offer: LunchOffer };

export default function DeleteOfferPage({ params }: DeleteOfferPageProps) {
  const router = useRouter();
  const [offerId, setOfferId] = React.useState<string | null>(null);
  const [state, setState] = React.useState<LoadState>({ status: "loading" });
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      const { id } = await params;
      if (cancelled) return;
      setOfferId(id);

      const [offerResult, sessionToken] = await Promise.all([
        getOfferById(id),
        ensureSessionToken(),
      ]);

      if (cancelled) return;

      if (!offerResult.success) {
        setState({ status: "not_found" });
        return;
      }

      if (offerResult.data.sessionToken !== sessionToken) {
        setState({ status: "forbidden" });
        return;
      }

      setState({ status: "ready", offer: offerResult.data });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [params]);

  async function handleDelete() {
    if (!offerId) return;
    setFormError(null);
    setIsDeleting(true);

    const result = await deleteOfferAction(offerId);
    if (result.success) {
      router.push("/");
      return;
    }

    setFormError(result.error);
    setIsDeleting(false);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="mb-4"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Powrót
        </Button>
        <h1 className="text-2xl font-bold text-foreground">Usuń ofertę</h1>
      </div>

      {state.status === "loading" && (
        <p className="text-sm text-muted-foreground">Ładowanie...</p>
      )}

      {state.status === "not_found" && (
        <div className="rounded-[4px] border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">Nie znaleziono oferty.</p>
        </div>
      )}

      {state.status === "forbidden" && (
        <div className="rounded-[4px] border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">
            Nie masz uprawnień do usunięcia tej oferty.
          </p>
        </div>
      )}

      {state.status === "ready" && (
        <div className="flex flex-col gap-6">
          {/* Confirmation card */}
          <div className="rounded-[4px] border border-border bg-card p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-[4px] bg-destructive/10 p-2 text-destructive">
                <AlertTriangle className="size-5" aria-hidden="true" />
              </div>
              <div className="flex flex-col gap-3">
                <p className="text-sm text-foreground">
                  Czy na pewno chcesz usunąć tę ofertę? Tej operacji nie można cofnąć.
                </p>

                <dl className="flex flex-col gap-2 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Danie
                    </dt>
                    <dd className="text-foreground">{state.offer.dishName}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Restauracja
                    </dt>
                    <dd className="text-foreground">{state.offer.restaurantName}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Cena
                    </dt>
                    <dd className="text-foreground">
                      {state.offer.price.toFixed(2)} {state.offer.currency}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          {/* Error */}
          {formError && (
            <div className="rounded-[4px] border border-destructive/30 bg-destructive/5 px-4 py-3">
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              disabled={isDeleting}
            >
              Anuluj
            </Button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="inline-flex min-h-[40px] items-center rounded-[4px] border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
            >
              {isDeleting ? "Usuwanie..." : "Usuń ofertę"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
