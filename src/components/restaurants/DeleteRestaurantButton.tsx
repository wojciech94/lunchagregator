"use client";

import { AlertTriangle } from "lucide-react";
import { deleteRestaurant } from "@/actions/restaurants";
import { DeleteRecordDialog } from "@/components/admin/DeleteRecordDialog";
import { Button } from "@/components/ui/button";

export interface DeletableRestaurant {
  id: string;
  name: string;
  address: string | null;
  /** False when the record has no owner. */
  hasOwner: boolean;
  /**
   * How many offers point here.
   *
   * Deleting a restaurant does not delete its offers -- `restaurant_id` is set
   * to null, so the offers stay on the public list with the name they were
   * filed under. An operator deciding to delete should be told that, because
   * "delete the restaurant" reasonably reads as removing everything named
   * after it.
   */
  activeOffersCount: number;
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
  return (
    <DeleteRecordDialog
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
          {restaurant.activeOffersCount > 0 && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Oferty powiązane
              </dt>
              <dd className="text-foreground">
                {restaurant.activeOffersCount}
              </dd>
            </div>
          )}
        </dl>
      }
      warning={
        restaurant.hasOwner ? (
          <div className="flex items-start gap-3 rounded-[4px] border border-destructive/30 bg-destructive/5 p-4">
            <AlertTriangle
              className="mt-0.5 size-5 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <p className="text-sm text-destructive">
              Ta restauracja ma właściciela. Usuwasz jego wpis, a oferty przy
              niej pozostaną na liście pod nazwą z oferty.
            </p>
          </div>
        ) : undefined
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