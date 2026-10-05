"use client";

import * as React from "react";
import { Calendar, CheckCircle2, AlertTriangle, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { DAY_LABELS_PL, nextDateForDay } from "@/utils/day-of-week";
import type { PrefilledOffer, PrefilledDish } from "@/lib/validations/extraction";
import type { DayOfWeek } from "@/services/ai-analyzer";
import type { AssignedRestaurant } from "@/lib/restaurant-match";

export interface WeeklyMenuPreviewProps {
  offer: PrefilledOffer;
  /**
   * Req 8.1: the restaurant assigned before this preview opened. The batch is
   * published under its name and address, with `restaurantId` set, so the
   * server can take the snapshot from the entity (Req 8.3). This replaces the
   * editable name field (#39): a menu photo with an unreadable name can no
   * longer fail the whole batch at the server, because the name is guaranteed
   * before publication.
   */
  assignedRestaurant: AssignedRestaurant;
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
  assignedRestaurant,
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
        // Only include dishes that have the required fields.
        // `!= null` rather than `!== null`: a dish with no price at all is
        // still missing it, and would otherwise reach the server as
        // `price: undefined` and fail validation there.
        if (dish.name && dish.price != null && dish.price > 0) {
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
          {days.length === 1 ? "dzień" : "dni"}. Zaznacz dni, które chcesz
          opublikować.
        </p>

        <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Restauracja
          </p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">
            {assignedRestaurant.name}
          </p>
          {assignedRestaurant.address && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" aria-hidden="true" />
              {assignedRestaurant.address}
            </p>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">
            Wszystkie dni tego menu zostaną opublikowane pod tą restauracją.
          </p>
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
