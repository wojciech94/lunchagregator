"use client";

import * as React from "react";
import { Calendar, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { DAY_LABELS_PL, WEEKDAYS, nextDateForDay } from "@/utils/day-of-week";
import type { PrefilledOffer, PrefilledDish } from "@/lib/validations/extraction";
import type { DayOfWeek } from "@/services/ai-analyzer";

export interface WeeklyMenuPreviewProps {
  offer: PrefilledOffer;
  /** Called with the list of dishes the user chose to publish, each resolved to a date. */
  onConfirm: (selected: { dish: PrefilledDish; date: string }[]) => void;
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
    const selected: { dish: PrefilledDish; date: string }[] = [];
    for (const day of days) {
      if (!selectedDays.has(day)) continue;
      const dishesForDay = grouped.get(day) ?? [];
      const date = nextDateForDay(day);
      for (const dish of dishesForDay) {
        // Only include dishes that have the required fields
        if (dish.name && dish.price !== null) {
          selected.push({ dish, date });
        }
      }
    }
    onConfirm(selected);
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
          {days.length === 1 ? "dzień" : "dni"} dla restauracji{" "}
          <span className="text-foreground font-medium">
            {offer.restaurantName ?? "—"}
          </span>
          . Zaznacz dni, które chcesz opublikować.
        </p>
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
                  const incomplete = !dish.name || dish.price === null;
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
                        {dish.price !== null ? (
                          <span className="text-sm font-medium text-primary">
                            {dish.price.toFixed(2)} PLN
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
      <div className="flex items-center justify-between gap-3 border-t border-border p-4">
        <span className="text-sm text-muted-foreground">
          Wybrano {selectedCount} z {days.length}
        </span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSubmitting || selectedCount === 0}
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
