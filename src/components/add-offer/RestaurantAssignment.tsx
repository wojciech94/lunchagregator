"use client";

import * as React from "react";
import { Building2, CheckCircle2, Loader2, MapPin, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { searchRestaurants, createRestaurant } from "@/actions/restaurants";
import { RestaurantSelect } from "@/components/restaurants/RestaurantSelect";
import {
  pickRestaurantMatch,
  type AssignedRestaurant,
} from "@/lib/restaurant-match";
import type { RestaurantSummary } from "@/types/restaurants";

// ============================================================================
// Types
// ============================================================================

export interface RestaurantAssignmentProps {
  /**
   * The restaurant name the extraction read, when it read one. Drives the
   * auto-match; null (the manual-entry path) skips straight to choosing.
   */
  extractedName: string | null;
  /** Called once the User has assigned (picked or created) a restaurant. */
  onAssigned: (restaurant: AssignedRestaurant) => void;
  className?: string;
}

type Phase = "matching" | "confirm" | "choose";

// ============================================================================
// Component
// ============================================================================

/**
 * Req 8.1–8.2: no offer form opens until the offer is assigned a restaurant.
 *
 * The match itself is deterministic (`pickRestaurantMatch`): a confident hit
 * is preselected and only needs the User's confirmation; anything else lands
 * here in the choose phase — pick from the existing search, or create the
 * restaurant inline (name prefilled from the extraction, address required,
 * geocoded server-side by the existing `createRestaurant` path).
 */
export function RestaurantAssignment({
  extractedName,
  onAssigned,
  className,
}: RestaurantAssignmentProps) {
  const [phase, setPhase] = React.useState<Phase>(() =>
    extractedName && extractedName.trim().length >= 2 ? "matching" : "choose"
  );
  const [match, setMatch] = React.useState<RestaurantSummary | null>(null);
  const [matchError, setMatchError] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState(() => extractedName ?? "");
  const [createAddress, setCreateAddress] = React.useState("");
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);

  React.useEffect(() => {
    if (phase !== "matching") return;
    const name = extractedName?.trim() ?? "";
    let cancelled = false;

    (async () => {
      try {
        const results = await searchRestaurants(name);
        if (cancelled) return;
        const found = pickRestaurantMatch(name, results);
        setMatch(found);
        setPhase(found ? "confirm" : "choose");
      } catch {
        if (cancelled) return;
        // A failed search is not a failed assignment: the User can still
        // pick from the search box or create the restaurant by hand.
        setMatchError(
          "Nie udało się przeszukać restauracji. Wybierz ręcznie poniżej."
        );
        setPhase("choose");
      }
    })();

    return () => {
      cancelled = true;
    };
    // `extractedName` is fixed for the lifetime of the step: the parent
    // remounts the component when a new extraction arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePick(summary: RestaurantSummary | null) {
    if (!summary) return;
    onAssigned(summaryToAssigned(summary));
  }

  function summaryToAssigned(summary: RestaurantSummary): AssignedRestaurant {
    return { id: summary.id, name: summary.name, address: summary.address };
  }

  async function handleCreate() {
    const name = createName.trim();
    const address = createAddress.trim();

    if (name.length < 2) {
      setCreateError("Nazwa restauracji musi mieć co najmniej 2 znaki.");
      return;
    }
    if (address.length === 0) {
      setCreateError("Adres jest wymagany — bez niego oferta nie dostanie lokalizacji.");
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    try {
      const result = await createRestaurant({ name, address });
      if (!result.success) {
        setCreateError(result.error);
        return;
      }
      onAssigned({
        id: result.data.id,
        name: result.data.name,
        address: result.data.address,
      });
    } catch {
      setCreateError(
        "Nie udało się utworzyć restauracji. Spróbuj ponownie."
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card p-5 shadow-[0_1.2px_0_0_rgba(0,0,0,0.03)]",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Building2 className="size-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">
          Przypisz restaurację
        </h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Każda oferta musi być przypisana do restauracji — dzięki temu da się ją
        śledzić i wznowić razem z całym menu.
      </p>

      {phase === "matching" && (
        <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Szukam restauracji „{extractedName}”...
        </div>
      )}

      {phase === "confirm" && match && (
        <div className="mt-5 flex flex-col gap-4">
          <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Rozpoznana restauracja
            </p>
            <p className="mt-1 text-base font-semibold text-foreground">
              {match.name}
            </p>
            {match.address && (
              <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                {match.address}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => handlePick(match)}>
              <CheckCircle2 className="size-4" />
              To jest ta restauracja
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPhase("choose")}
            >
              To nie ta — wybierz ręcznie
            </Button>
          </div>
        </div>
      )}

      {phase === "choose" && (
        <div className="mt-5 flex flex-col gap-5">
          {matchError && (
            <p className="text-sm text-destructive" role="alert">
              {matchError}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <Label>Wybierz istniejącą restaurację</Label>
            <RestaurantSelect onSelect={handlePick} />
          </div>

          <div className="flex flex-col gap-3 rounded-md border border-border p-4">
            <button
              type="button"
              onClick={() => setCreateOpen((prev) => !prev)}
              className="self-start text-sm font-medium text-primary underline-offset-2 hover:underline"
              aria-expanded={createOpen}
            >
              Nie ma jej na liście? Dodaj nową restaurację
            </button>

            {createOpen && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="create-restaurant-name">
                    Nazwa restauracji
                    <span className="text-destructive ml-0.5">*</span>
                  </Label>
                  <Input
                    id="create-restaurant-name"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    maxLength={100}
                    placeholder="np. Restauracja Pod Lipami"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="create-restaurant-address">
                    Adres
                    <span className="text-destructive ml-0.5">*</span>
                  </Label>
                  <Input
                    id="create-restaurant-address"
                    value={createAddress}
                    onChange={(e) => setCreateAddress(e.target.value)}
                    maxLength={200}
                    placeholder="np. ul. Marszałkowska 10, Warszawa"
                  />
                  <p className="text-xs text-muted-foreground">
                    Adres służy do wyliczenia odległości — zostanie
                    zgeokodowany po stronie serwera.
                  </p>
                </div>
                {createError && (
                  <p className="text-sm text-destructive" role="alert">
                    {createError}
                  </p>
                )}
                <Button
                  type="button"
                  onClick={handleCreate}
                  disabled={isCreating}
                  className="self-start"
                >
                  {isCreating ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Utwórz i przypisz
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
