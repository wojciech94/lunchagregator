"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renewMenuAction } from "@/actions/offers";

// ============================================================================
// Types
// ============================================================================

export interface RenewMenuButtonProps {
  restaurantId: string;
  restaurantName: string;
  /**
   * The derived `menu_recurs_weekly` state: true while a recurring schedule is
   * active, or while a legacy flag still awaits owner-confirmed setup (#139).
   */
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
 * Automatic repetition is a separate capability (#139). It is configured and
 * stopped in "Moje menu", where the schedule is the single source of truth and
 * `menu_recurs_weekly` is derived from it. This button therefore never writes
 * that flag: it keeps the manual duplication path for one-off menus and points
 * owners at the schedule view instead.
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

  const scheduleLink = (
    <Link
      href="/my-menus"
      className="flex min-h-[44px] items-center self-start text-sm text-primary underline underline-offset-4 hover:text-primary/80"
    >
      {hasWeeklyFlag
        ? "Potwierdź harmonogram w Moje menu"
        : "Ustaw automatyczne menu"}
    </Link>
  );

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
        {hasWeeklyFlag && (
          <p className="text-xs text-muted-foreground">
            Menu tygodniowe — potwierdź harmonogram w „Moje menu”, aby włączyć
            automatyczne publikowanie.
          </p>
        )}
        {scheduleLink}
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
      {hasWeeklyFlag && (
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs text-primary">
          <Repeat className="size-3" aria-hidden="true" />
          menu tygodniowe
        </span>
      )}
      {hasWeeklyFlag && scheduleLink}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
