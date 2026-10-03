"use client";

import * as React from "react";
import { Calendar, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DAY_LABELS_PL, nextDateForDay } from "@/utils/day-of-week";
import type { PrefilledOffer, PrefilledDish } from "@/lib/validations/extraction";
import type { DayOfWeek } from "@/services/ai-analyzer";

export interface WeeklyMenuPreviewProps {
  offer: PrefilledOffer;
  /**
   * Called with the list of dishes the user chose to publish, each resolved to
   * a date, plus the restaurant name to publish them under.
   *
   * The name is passed back rather than read from `offer` because it is
   * editable here. `createOfferSchema` requires it, and `restaurantName` is
   * frequently null for a menu photo, so a batch published without it fails
   * validation on every single day at once.
   */
  onConfirm: (
    selected: { dish: PrefilledDish; date: string }[],
    restaurantName: string
  ) => void;
  isSubmitting?: boolean;
  className?: string;
}

/** Groups dishes by their dayOfWeek, preserving day order (Mon–Sun). */
function groupByDay(dishes: PrefilledDish[]): Map<DayOfWeek, PrefilledDish[]> {
  const order: DayOfWeek[] = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  const map = new Map<DayOfWeek, PrefilledDish[]>();
  for (const day of order) {
    const forDay = dishes.filter((d) => d.dayOfWeek === day);
    if (forDay.length > 0) map.set(day, forDay);
  }
  return map;
}

export function WeeklyMenuPreview({
  offer,
  onConfirm,
  isSubmitting = false,
  className,
}: WeeklyMenuPreviewProps) {
  const grouped = React.useMemo(() => groupByDay(offer.dishes), [offer.dishes]);
  const days = React.useMemo(() => Array.from(grouped.keys()), [grouped]);

  // All days selected by default
  const [selectedDays, setSelectedDays] = React.useState<Set<DayOfWeek>>(
    () => new Set(days)
  );

  // Editable because the AI often cannot read a restaurant name off a menu
  // photo, and `createOfferSchema` rejects an empty one. Publishing is blocked
  // until it is filled rather than letting the whole batch fail at the server.
  const [restaurantName, setRestaurantName] = React.useState(
    () => offer.restaurantName ?? ""
  );
  const [nameError, setNameError] = React.useState<string | null>(null);

  const nameMissingFromExtraction = !offer.restaurantName?.trim();
  const canPublish = restaurantName.trim().length > 0;

  const toggleDay = (day: DayOfWeek) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const selectedCount = days.filter((d) => selectedDays.has(d)).length;

  const handleConfirm = () => {
    const name = restaurantName.trim();
    if (name.length === 0) {
      setNameError("Nazwa restauracji jest wymagana do opublikowania menu.");
      return;
    }
    setNameError(null);

    const selected: { dish: PrefilledDish; date: string }[] = [];
    for (const day of days) {
      if (!selectedDays.has(day)) continue;
      const dishesForDay = grouped.get(day) ?? [];
      const date = nextDateForDay(day);
      for (const dish of dishesForDay) {
        // Only include dishes that have the required fields.
        // `!= null` rather than `!== null`: a dish with no price at all is
        // still missing it, and would otherwise reach the server as
        // `price: undefined` and fail validation there.
        if (dish.name && dish.price != null && dish.price > 0) {
          selected.push({ dish, date });
        }
      }
    }
    onConfirm(selected, name);
  };

  return (
    <div className={cn("rounded-md border border-border bg-card shadow-[0_1.2px_0_0_rgba(0,0,0,0.03)]", className)}>
      {/* Header */}
      <div className="border-b border-border p-5">
        <div className="flex items-center gap-2">
          <Calendar className="size-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">
            Menu tygodniowe
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Wykryto menu na {days.length}{" "}
          {days.length === 1 ? "dzień" : "dni"}. Zaznacz dni, które chcesz
          opublikować.
        </p>

        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="weekly-restaurant-name">
            Nazwa restauracji
            <span className="text-destructive ml-0.5">*</span>
          </Label>
          <Input
            id="weekly-restaurant-name"
            value={restaurantName}
            onChange={(e) => {
              setRestaurantName(e.target.value);
              if (nameError) setNameError(null);
            }}
            onBlur={() => {
              if (restaurantName.trim().length === 0 && nameMissingFromExtraction) {
                setNameError(
                  "AI nie odczytało nazwy restauracji z tego materiału. Uzupełnij ją, aby opublikować menu."
                );
              }
            }}
            maxLength={100}
            placeholder="np. Restauracja Pod Lipami"
            aria-invalid={!!nameError}
            aria-describedby={nameError ? "weekly-restaurant-name-error" : undefined}
          />
          {nameError ? (
            <p id="weekly-restaurant-name-error" className="text-sm text-destructive" role="alert">
              {nameError}
            </p>
          ) : nameMissingFromExtraction ? (
            <p className="text-xs text-muted-foreground">
              Nazwa jest wymagana — bez niej żadna oferta z tego menu nie
              zostanie zapisana.
            </p>
          ) : null}
        </div>
      </div>

      {/* Days */}
      <div className="divide-y divide-border">
        {days.map((day) => {
          const dishesForDay = grouped.get(day) ?? [];
          const active = selectedDays.has(day);
          const date = nextDateForDay(day);
          return (
            <label
              key={day}
              className={cn(
                "flex cursor-pointer items-start gap-3 p-4 transition-colors",
                active ? "bg-primary/5" : "hover:bg-muted/40"
              )}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggleDay(day)}
                className="mt-1 size-4 rounded-[2px] border-border accent-primary"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {DAY_LABELS_PL[day]}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {new Date(date + "T00:00:00").toLocaleDateString("pl-PL", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
                {dishesForDay.map((dish, i) => {
                  // A price of 0 or undefined is not a price the schema
                  // accepts, so it renders as missing rather than as
                  // "0.00 PLN". `dish.price?.toFixed` also keeps a missing
                  // price from throwing during render.
                  const hasPrice =
                    dish.price != null && dish.price > 0;
                  return (
                    <div key={i} className="mt-1.5 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-foreground truncate">
                          {dish.name ?? "Brak nazwy"}
                        </p>
                        {dish.items.length > 0 && (
                          <p className="text-xs text-muted-foreground truncate">
                            {dish.items.join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        {hasPrice ? (
                          <span className="text-sm font-medium text-primary">
                            {dish.price!.toFixed(2)} PLN
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-500">
                            <AlertTriangle className="size-3" />
                            brak ceny
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </label>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
        <span className="text-sm text-muted-foreground">
          Wybrano {selectedCount} z {days.length}
        </span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSubmitting || selectedCount === 0 || !canPublish}
          className="inline-flex items-center gap-2 rounded-[4px] bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-[#5e6ad2] disabled:opacity-50"
        >
          <CheckCircle2 className="size-4" />
          {isSubmitting
            ? "Publikowanie..."
            : `Opublikuj ${selectedCount} ${selectedCount === 1 ? "ofertę" : "ofert"}`}
        </button>
      </div>
    </div>
  );
}
