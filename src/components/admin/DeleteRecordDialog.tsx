"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";

export interface DeleteRecordDialogProps {
  /** The control that opens the dialog. Usually a destructive button. */
  trigger?: React.ReactNode;

  /** "Usuń ofertę" */
  title: string;
  /** "Oferta usunięta" */
  deletedTitle: string;
  /** Shown while asking. */
  description: React.ReactNode;
  /** Shown after the record is gone: what changed. */
  deletedDescription: React.ReactNode;
  /** The named record. A confirmation saying only "sure?" leaves the operator
   *  recalling which row they clicked, and these lists all look alike. */
  details?: React.ReactNode;
  /** Extra caution, e.g. a record nobody can correct any more. */
  warning?: React.ReactNode;
  confirmLabel: string;

  /**
   * Runs the deletion. Returns an error message rather than throwing, so a
   * provider rejection becomes text in the dialog instead of an unhandled
   * rejection that leaves the reader staring at a spinner.
   */
  onConfirm: () => Promise<{ success: true } | { success: false; error: string }>;
  /** Allows a caller to load deletion consequences before enabling confirmation. */
  onOpenChange?: (open: boolean) => void;
  confirmDisabled?: boolean;

  /**
   * Where to go once the record is gone. Omitted on a list the operator is
   * working through, which then refreshes in place.
   *
   * A detail page needs it for an obvious reason: the record it is showing no
   * longer exists, so re-rendering would render a 404 the operator caused.
   */
  redirectTo?: string;
  className?: string;
}

/**
 * A confirmation dialog for destroying one record, with no opinion about what
 * that record is.
 *
 * The behaviour here is not incidental, so it is worth stating once:
 *
 * - The dialog does **not** close itself on success. It swaps to a "removed"
 *   message with a single close button, and the page behind is refreshed at
 *   that moment rather than before. Closing on success gives no confirmation at
 *   all -- the row disappears and the operator cannot tell a successful delete
 *   from a refresh that quietly failed. Refreshing first would unmount this
 *   component, taking the dialog and its message with it. So: delete, tell the
 *   reader, and only then drop the row.
 * - Cancel is Radix's `DialogClose`, not a button with an onClick. The onClick
 *   path alone would reset this component's state while leaving the dialog open
 *   on screen -- a cancel that does not cancel.
 */
export function DeleteRecordDialog({
  trigger,
  title,
  deletedTitle,
  description,
  deletedDescription,
  details,
  warning,
  confirmLabel,
  onConfirm,
  onOpenChange,
  confirmDisabled = false,
  redirectTo,
  className,
}: DeleteRecordDialogProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [deleted, setDeleted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleDelete() {
    if (confirmDisabled || isDeleting) return;
    setIsDeleting(true);
    setError(null);

    const result = await onConfirm();

    if (!result.success) {
      setError(result.error);
      setIsDeleting(false);
      return;
    }

    setDeleted(true);
  }

  /** Leaving the dialog is what applies the change to the page behind it. */
  function handleOpenChange(open: boolean) {
    onOpenChange?.(open);
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
        {trigger ?? (
          <Button variant="destructive" size="sm" className={className}>
            <Trash2 className="size-4" aria-hidden="true" />
            Usuń
          </Button>
        )}
      </DialogTrigger>

      <DialogContent>
        {deleted ? (
          <>
            <DialogHeader>
              <DialogTitle>{deletedTitle}</DialogTitle>
              <DialogDescription>{deletedDescription}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button>Gotowe</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>

            {details}
            {warning}

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
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting || confirmDisabled}
              >
                {isDeleting ? "Usuwanie..." : confirmLabel}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
