"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";

import { deleteOfferAction } from "@/actions/offers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
  /**
   * Where to go once the record is gone. Omitted on a list the operator is
   * working through, which then refreshes in place.
   *
   * A string rather than a callback because this is rendered by server
   * components and a function does not survive the boundary.
   *
   * Needed on a detail page for an obvious reason: the record it is showing no
   * longer exists, so re-rendering it would render a 404 the operator caused.
   */
  redirectTo?: string;
  className?: string;
}

/**
 * Deletes an offer, behind a confirmation dialog.
 *
 * This replaces a dedicated `/offers/[id]/delete` page, which cost two navigations
 * to say one thing and then threw the operator onto the public offer list
 * afterwards -- the wrong destination from every page that could reach it. A
 * dialog keeps the operator where they were and leaves one question to answer.
 *
 * On success the dialog does not close by itself. It swaps to "usunięto" with a
 * single close button, and the list behind is refreshed at that moment rather
 * than before. Two reasons, in order:
 *
 *  - Closing on success gives no confirmation at all. The row disappears and the
 *    operator cannot tell a successful delete from a refresh that quietly failed.
 *  - Refreshing first would unmount this component -- the row it lives in is gone
 *    -- taking the dialog and the message with it.
 *
 * So the order is: delete, tell the reader, and only then drop the row.
 */
export function DeleteOfferButton({
  offer,
  redirectTo,
  className,
}: DeleteOfferButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [deleted, setDeleted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);

    const result = await deleteOfferAction(offer.id);

    if (!result.success) {
      setError(result.error);
      setIsDeleting(false);
      return;
    }

    setDeleted(true);
  }

  /** Leaving the dialog is what applies the change to the page behind it. */
  function handleOpenChange(open: boolean) {
    if (open) {
      setError(null);
      return;
    }

    if (deleted) {
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    }

    setDeleted(false);
    setIsDeleting(false);
    setError(null);
  }

  return (
    <Dialog onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" className={className}>
          <Trash2 className="size-4" aria-hidden="true" />
          Usuń
        </Button>
      </DialogTrigger>

      <DialogContent>
        {deleted ? (
          <>
            <DialogHeader>
              <DialogTitle>Oferta usunięta</DialogTitle>
              <DialogDescription>
                „{offer.dishName}” z {offer.restaurantName} zniknęła z listy.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              {/* `DialogClose`, not a plain button with an onClick. The onClick
                  path alone would reset this component's state while leaving the
                  dialog open on screen -- a cancel that does not cancel. Closing
                  is Radix's job; `handleOpenChange` then applies the change. */}
              <DialogClose asChild>
                <Button>Gotowe</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Usuń ofertę</DialogTitle>
              <DialogDescription>
                Tej operacji nie można cofnąć.
              </DialogDescription>
            </DialogHeader>

            {/* What is being removed, named. A confirmation that says only "sure?"
                leaves the operator recalling which row they clicked, and this one
                is on a list of rows that all look alike. */}
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

            {!offer.hasOwner && (
              <div className="flex items-start gap-3 rounded-[4px] border border-destructive/30 bg-destructive/5 p-4">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
                <p className="text-sm text-destructive">
                  Ta oferta nie ma właściciela. Usuwasz dane, których nikt nie może już
                  poprawić, a wiersz zostanie w logu administracji.
                </p>
              </div>
            )}

            {error && (
              <div className="rounded-[4px] border border-destructive/30 bg-destructive/5 px-4 py-3">
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              </div>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost" disabled={isDeleting}>
                  Anuluj
                </Button>
              </DialogClose>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="inline-flex min-h-[40px] items-center rounded-[4px] border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
              >
                {isDeleting ? "Usuwanie..." : "Usuń ofertę"}
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
