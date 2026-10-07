"use client";

import { AlertTriangle } from "lucide-react";
import { useRef, useState } from "react";
import { countRestaurantLinkedOffers, deleteRestaurant } from "@/actions/restaurants";
import { DeleteRecordDialog } from "@/components/admin/DeleteRecordDialog";
import { Button } from "@/components/ui/button";

export interface DeletableRestaurant {
  id: string;
  name: string;
  address: string | null;
}

interface DeleteRestaurantButtonProps {
  restaurant: DeletableRestaurant;
  redirectTo?: string;
  className?: string;
}

/**
 * Deletes a restaurant, behind a confirmation dialog.
 *
 * Replaces a `window.confirm` that was the only confirmation the restaurant
 * detail page had. The offer side moved to a dialog in #63 for good reasons --
 * two navigations to ask one question, and the wrong destination afterwards --
 * and leaving `window.confirm` on this one page meant the two halves of the
 * same action behaved differently.
 */
export function DeleteRestaurantButton({
  restaurant,
  redirectTo,
  className,
}: DeleteRestaurantButtonProps) {
  const [linkedOffersCount, setLinkedOffersCount] = useState<number | null>(null);
  const [countError, setCountError] = useState<string | null>(null);
  const requestId = useRef(0);

  async function handleOpenChange(open: boolean) {
    const currentRequest = ++requestId.current;
    setLinkedOffersCount(null);
    setCountError(null);
    if (!open) return;
    try {
      const result = await countRestaurantLinkedOffers(restaurant.id);
      if (currentRequest !== requestId.current) return;
      if (result.success) setLinkedOffersCount(result.data);
      else setCountError(result.error);
    } catch {
      if (currentRequest === requestId.current) setCountError('Nie udało się policzyć powiązanych ofert. Zamknij dialog i spróbuj ponownie.');
    }
  }
  return (
    <DeleteRecordDialog
      onOpenChange={handleOpenChange}
      confirmDisabled={linkedOffersCount === null}
      redirectTo={redirectTo}
      className={className}
      title="Usuń restaurację"
      deletedTitle="Restauracja usunięta"
      confirmLabel="Usuń restaurację"
      description="Tej operacji nie można cofnąć."
      deletedDescription={
        <>
          „{restaurant.name}” zniknęła z listy.
        </>
      }
      trigger={
        <Button
          variant="destructive"
          size="sm"
          className={
            className ??
            "inline-flex items-center gap-1.5 rounded-[4px] bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
          }
        >
          Usuń
        </Button>
      }
      details={
        <dl className="flex flex-col gap-2 rounded-[4px] border border-border bg-card p-4 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Restauracja
            </dt>
            <dd className="text-foreground">{restaurant.name}</dd>
          </div>
          {restaurant.address && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Adres
              </dt>
              <dd className="text-foreground">{restaurant.address}</dd>
            </div>
          )}
          <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Wszystkie oferty powiązane (również wygasłe)
              </dt>
              <dd className="text-foreground">
                {linkedOffersCount === null ? 'Sprawdzanie liczby ofert…' : linkedOffersCount}
              </dd>
          </div>
          {countError && <p role="alert" className="text-destructive">{countError}</p>}
        </dl>
      }
      warning={
        (
          <div className="flex items-start gap-3 rounded-[4px] border border-destructive/30 bg-destructive/5 p-4">
            <AlertTriangle
              className="mt-0.5 size-5 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <p className="text-sm text-destructive">
              Usunięcie restauracji odłączy wszystkie jej oferty, także wygasłe.
              Oferty nie zostaną usunięte. Pozostaną zapisane, a bieżące i przyszłe
              nadal będą dostępne na liście ofert.
            </p>
          </div>
        )
      }
      onConfirm={async () => {
        const result = await deleteRestaurant(restaurant.id);
        return result.success
          ? { success: true }
          : { success: false, error: result.error };
      }}
    />
  );
}
