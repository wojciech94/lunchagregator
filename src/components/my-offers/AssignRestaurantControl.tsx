"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RestaurantAssignment } from "@/components/add-offer/RestaurantAssignment";
import { assignOfferRestaurantAction } from "@/actions/offers";
import type { AssignedRestaurant } from "@/lib/restaurant-match";

// ============================================================================
// Types
// ============================================================================

export interface AssignRestaurantControlProps {
  /** The unlinked offers this decision covers (one snapshot-name group). */
  offerIds: string[];
  /** The offers' snapshot name — what the auto-match runs against. */
  snapshotName: string;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * The attach flow (#74): the „Bez restauracji" bucket's way out. Expands into
 * the same assignment step the add flow uses — auto-match on the snapshot
 * name, pick from search, or create inline — and attaches the whole sub-group
 * to the chosen restaurant.
 *
 * Attach-when-null only: the action skips anything already linked, and the
 * snapshot is never rewritten (Req 6.2). On success the page refreshes, and
 * the offers reappear as a linked group with the renewal button.
 */
export function AssignRestaurantControl({
  offerIds,
  snapshotName,
  className,
}: AssignRestaurantControlProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleAssigned(restaurant: AssignedRestaurant) {
    setIsBusy(true);
    setError(null);
    try {
      const result = await assignOfferRestaurantAction(offerIds, restaurant.id);
      if (!result.success) {
        setError(result.error);
        setIsBusy(false);
        return;
      }
      // The offers now belong to a linked group; the server re-render moves
      // them out of this bucket.
      router.refresh();
    } catch {
      setError("Nie udało się przypisać ofert. Spróbuj ponownie.");
      setIsBusy(false);
    }
  }

  if (isBusy) {
    return (
      <div
        className={
          "flex items-center gap-2 text-sm text-muted-foreground " +
          (className ?? "")
        }
      >
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Przypisuję {offerIds.length}{" "}
        {offerIds.length === 1 ? "ofertę" : "oferty"}...
      </div>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={className}
      >
        Przypisz restaurację
      </Button>
    );
  }

  return (
    <div className={"flex flex-col gap-3 " + (className ?? "")}>
      <RestaurantAssignment
        extractedName={snapshotName}
        onAssigned={handleAssigned}
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(false)}
        className="self-start"
      >
        Anuluj
      </Button>
    </div>
  );
}
