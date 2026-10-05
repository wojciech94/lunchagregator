"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renewMenuAction } from "@/actions/offers";
import { updateRestaurant } from "@/actions/restaurants";

// ============================================================================
// Types
// ============================================================================

export interface RenewMenuButtonProps {
  restaurantId: string;
  restaurantName: string;
  /** The restaurant's `menu_recurs_weekly` flag as of page render. */
  hasWeeklyFlag: boolean;
  className?: string;
}

interface RenewalSummary {
  created: number;
  skipped: number;
  failed: number;
  missingCoordinates: number;
}

/** 1 → ofertę, 2–4 → oferty, 5+ → ofert (z wyjątkami 12–14). */
function offersPlural(count: number): string {
  if (count === 1) return "ofertę";
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
    return "oferty";
  }
  return "ofert";
}

// ============================================================================
// Component
// ============================================================================

/**
 * The one-click renewal (Req 8.5–8.6): creates next week's offers from the
 * restaurant's current menu week, then reports what happened -- created,
 * skipped (already existing), failed, and the count saved without
 * coordinates.
 *
 * The weekly flag (Req 8.7) is offered as a one-click follow-up after a
 * successful renewal; revoking happens in the restaurant edit form. Nothing
 * here publishes anything on its own.
 */
export function RenewMenuButton({
  restaurantId,
  restaurantName,
  hasWeeklyFlag,
  className,
}: RenewMenuButtonProps) {
  const [isBusy, setIsBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<RenewalSummary | null>(null);
  const [flagged, setFlagged] = React.useState(hasWeeklyFlag);
  const [isFlagging, setIsFlagging] = React.useState(false);
  const [flagError, setFlagError] = React.useState<string | null>(null);

  async function renew() {
    setIsBusy(true);
    setError(null);
    try {
      const result = await renewMenuAction(restaurantId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSummary(result.data);
    } catch {
      setError("Wystąpił nieoczekiwany błąd podczas wznowienia. Spróbuj ponownie.");
    } finally {
      setIsBusy(false);
    }
  }

  async function markWeekly() {
    setIsFlagging(true);
    setFlagError(null);
    try {
      const result = await updateRestaurant(restaurantId, {
        menuRecursWeekly: true,
      });
      if (!result.success) {
        setFlagError(result.error);
        return;
      }
      setFlagged(true);
    } catch {
      setFlagError("Nie udało się zapisać flagi. Spróbuj ponownie.");
    } finally {
      setIsFlagging(false);
    }
  }

  if (summary) {
    return (
      <div
        className={
          "flex flex-col gap-2 rounded-md border border-primary/30 bg-primary/5 p-4 " +
          (className ?? "")
        }
      >
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <CheckCircle2 className="size-4 text-green-500" aria-hidden="true" />
          Utworzono {summary.created} {offersPlural(summary.created)} dla{" "}
          {restaurantName}.
        </p>
        {summary.skipped > 0 && (
          <p className="text-sm text-muted-foreground">
            Pominięto {summary.skipped} {offersPlural(summary.skipped)} — takie
            oferty już istnieją w nowym tygodniu.
          </p>
        )}
        {summary.failed > 0 && (
          <p className="text-sm text-destructive" role="alert">
            {summary.failed} {offersPlural(summary.failed)} nie udało się
            zapisać.
          </p>
        )}
        {summary.missingCoordinates > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Uwaga: {summary.missingCoordinates} {offersPlural(summary.missingCoordinates)}{" "}
            zapisano bez lokalizacji — nie pojawią się w sortowaniu po
            odległości. Uzupełnij adres restauracji i wznuż ponownie.
          </p>
        )}
        {!flagged && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={markWeekly}
            disabled={isFlagging}
            className="self-start mt-1"
          >
            {isFlagging ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Repeat className="size-4" />
            )}
            Oznacz jako menu tygodniowe (do odwołania)
          </Button>
        )}
        {flagged && (
          <p className="text-xs text-muted-foreground">
            Menu tygodniowe — odwołasz w edycji restauracji.
          </p>
        )}
        {flagError && (
          <p className="text-sm text-destructive" role="alert">
            {flagError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={"flex flex-col items-end gap-2 " + (className ?? "")}>
      <Button type="button" onClick={renew} disabled={isBusy} size="sm">
        {isBusy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Repeat className="size-4" />
        )}
        {isBusy ? "Wznawiam..." : "Wznów na kolejny tydzień"}
      </Button>
      {flagged && (
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs text-primary">
          <Repeat className="size-3" aria-hidden="true" />
          menu tygodniowe
        </span>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
