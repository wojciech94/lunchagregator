"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { deleteOfferAction } from "@/actions/offers";
import { DeleteRecordDialog } from "@/components/admin/DeleteRecordDialog";
import { Button } from "@/components/ui/button";

/** What the dialog shows about the record it is about to remove. */
export interface DeletableOffer {
  id: string;
  dishName: string;
  restaurantName: string;
  price: number;
  currency: string;
  /**
   * False when the record has no owner.
   *
   * Only an admin ever deletes such a record, so this is the case where the
   * confirmation has to say more than "are you sure".
   */
  hasOwner: boolean;
}

interface DeleteOfferButtonProps {
  offer: DeletableOffer;
  redirectTo?: string;
  className?: string;
}

/**
 * Deletes an offer, behind a confirmation dialog.
 *
 * This replaced a dedicated `/offers/[id]/delete` page, which cost two
 * navigations to say one thing and then threw the operator onto the public
 * offer list afterwards -- the wrong destination from every page that could
 * reach it. A dialog keeps the operator where they were and leaves one question
 * to answer.
 *
 * The dialog's behaviour -- not closing on success, refreshing on close, using
 * Radix's close for cancel -- belongs to `DeleteRecordDialog` and is documented
 * there. This component is the offer-shaped half: what to name, and what to
 * call the operation.
 */
export function DeleteOfferButton({
  offer,
  redirectTo,
  className,
}: DeleteOfferButtonProps) {
  return (
    <DeleteRecordDialog
      redirectTo={redirectTo}
      className={className}
      title="Usuń ofertę"
      deletedTitle="Oferta usunięta"
      confirmLabel="Usuń ofertę"
      description="Tej operacji nie można cofnąć."
      deletedDescription={
        <>
          „{offer.dishName}” z {offer.restaurantName} zniknęła z listy.
        </>
      }
      trigger={
        <Button variant="destructive" size="sm" className={className}>
          <Trash2 className="size-4" aria-hidden="true" />
          Usuń
        </Button>
      }
      details={
        <dl className="flex flex-col gap-2 rounded-[4px] border border-border bg-card p-4 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Danie
            </dt>
            <dd className="text-foreground">{offer.dishName}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Restauracja
            </dt>
            <dd className="text-foreground">{offer.restaurantName}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Cena
            </dt>
            <dd className="text-foreground">
              {offer.price.toFixed(2)} {offer.currency}
            </dd>
          </div>
        </dl>
      }
      warning={
        !offer.hasOwner ? (
          <div className="flex items-start gap-3 rounded-[4px] border border-destructive/30 bg-destructive/5 p-4">
            <AlertTriangle
              className="mt-0.5 size-5 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <p className="text-sm text-destructive">
              Ta oferta nie ma właściciela. Usuwasz dane, których nikt nie może
              jeszcze poprawić, a wiersz zostanie w logu administracji.
            </p>
          </div>
        ) : undefined
      }
      onConfirm={async () => {
        const result = await deleteOfferAction(offer.id);
        return result.success
          ? { success: true }
          : { success: false, error: result.error };
      }}
    />
  );
}