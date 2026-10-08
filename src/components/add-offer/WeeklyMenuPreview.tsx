"use client";

import * as React from "react";
import { Calendar, CheckCircle2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createOfferSchema } from "@/lib/validations/offer";
import {
  MAX_OFFERS_PER_BATCH,
  OFFER_BATCH_LIMIT_MESSAGE,
} from "@/lib/validations/offer-batch";
import {
  DAY_LABELS_PL,
  nextDateForDay,
  todayISO,
  toISODate,
} from "@/utils/day-of-week";
import type {
  PrefilledOffer,
  PrefilledDish,
} from "@/lib/validations/extraction";
import type { DayOfWeek } from "@/services/ai-analyzer";
import type { AssignedRestaurant } from "@/lib/restaurant-match";

export interface WeeklyMenuPreviewProps {
  offer: PrefilledOffer;
  assignedRestaurant: AssignedRestaurant;
  onConfirm: (selected: { dish: PrefilledDish; date: string }[]) => void;
  isSubmitting?: boolean;
  className?: string;
}

const DAYS: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
interface DraftOffer {
  id: number;
  dish: PrefilledDish;
  date: string;
  selected: boolean;
}

export function WeeklyMenuPreview({
  offer,
  assignedRestaurant,
  onConfirm,
  isSubmitting = false,
  className,
}: WeeklyMenuPreviewProps) {
  const instanceId = React.useId();
  const [draft, setDraft] = React.useState<DraftOffer[]>(() =>
    offer.dishes.map((dish, id) => ({
      id,
      dish: { ...dish },
      date: dish.dayOfWeek ? nextDateForDay(dish.dayOfWeek) : todayISO(),
      selected: true,
    })),
  );
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 30);
  const groups = [...DAYS, null]
    .map((day) => ({
      day,
      entries: draft.filter((entry) => entry.dish.dayOfWeek === day),
    }))
    .filter((group) => group.entries.length > 0);
  const selected = draft.filter((entry) => entry.selected);
  const selectedNoun = new Intl.PluralRules("pl").select(selected.length) === "one"
    ? "ofertę"
    : new Intl.PluralRules("pl").select(selected.length) === "few" ? "oferty" : "ofert";
  const overLimit = selected.length > MAX_OFFERS_PER_BATCH;
  const invalid = new Set(
    selected
      .filter(
        (entry) =>
          !createOfferSchema.safeParse({
            dishName: entry.dish.name?.trim(),
            price: entry.dish.price,
            availableDate: entry.date,
            restaurantName: assignedRestaurant.name,
            restaurantId: assignedRestaurant.id,
            sourceType: "text",
            description: entry.dish.description,
            items: entry.dish.items,
            dietaryTags: entry.dish.dietaryTags,
            allergens: entry.dish.allergens,
          }).success,
      )
      .map((entry) => entry.id),
  );

  function edit(id: number, patch: Partial<PrefilledDish>) {
    setDraft((previous) =>
      previous.map((entry) =>
        entry.id === id
          ? { ...entry, dish: { ...entry.dish, ...patch } }
          : entry,
      ),
    );
  }

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card shadow-sm",
        className,
      )}
    >
      <div className="border-b border-border p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Calendar className="size-5 text-primary" aria-hidden="true" />
          Menu tygodniowe
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sprawdź daty, ceny i skład zestawów. Popraw dane lub wyklucz oferty
          przed publikacją.
        </p>
        <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Restauracja</p>
          <p className="text-sm font-semibold">{assignedRestaurant.name}</p>
          {assignedRestaurant.address && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" aria-hidden="true" />
              {assignedRestaurant.address}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Wszystkie dni tego menu zostaną opublikowane pod tą restauracją.
          </p>
        </div>
      </div>
      <div className="divide-y divide-border">
        {groups.map(({ day, entries }) => (
          <section
            key={day ?? "undated"}
            className="space-y-3 p-4"
            aria-label={day ? DAY_LABELS_PL[day] : "Bez rozpoznanego dnia"}
          >
            <label className="flex items-center gap-2 font-semibold text-sm">
              <input
                type="checkbox"
                disabled={isSubmitting}
                checked={entries.every((entry) => entry.selected)}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setDraft((previous) =>
                    previous.map((entry) =>
                      entries.some((item) => item.id === entry.id)
                        ? { ...entry, selected: checked }
                        : entry,
                    ),
                  );
                }}
              />
              {day ? DAY_LABELS_PL[day] : "Bez rozpoznanego dnia"}
            </label>
            {entries.map((entry) => {
              const prefix = `${instanceId}-${entry.id}`;
              return (
                <fieldset
                  key={entry.id}
                  disabled={isSubmitting}
                  className={cn(
                    "space-y-3 rounded-md border p-3",
                    invalid.has(entry.id)
                      ? "border-destructive/50"
                      : "border-border",
                  )}
                >
                  <legend className="px-1 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        disabled={isSubmitting}
                        checked={entry.selected}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setDraft((previous) =>
                            previous.map((item) =>
                              item.id === entry.id
                                ? { ...item, selected: checked }
                                : item,
                            ),
                          );
                        }}
                      />
                      Publikuj ofertę {entry.id + 1}
                    </label>
                  </legend>
                  <div>
                    <label
                      htmlFor={`${prefix}-name`}
                      className="text-xs text-muted-foreground"
                    >
                      Nazwa dania
                    </label>
                    <Input
                      id={`${prefix}-name`}
                      value={entry.dish.name ?? ""}
                      maxLength={100}
                      onChange={(event) =>
                        edit(entry.id, { name: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor={`${prefix}-price`}
                        className="text-xs text-muted-foreground"
                      >
                        Cena (PLN)
                      </label>
                      <Input
                        id={`${prefix}-price`}
                        type="number"
                        min="0.01"
                        max="9999.99"
                        step="0.01"
                        value={entry.dish.price ?? ""}
                        onChange={(event) =>
                          edit(entry.id, {
                            price:
                              event.target.value === ""
                                ? null
                                : event.target.valueAsNumber,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`${prefix}-date`}
                        className="text-xs text-muted-foreground"
                      >
                        Data publikacji
                      </label>
                      <Input
                        id={`${prefix}-date`}
                        type="date"
                        min={todayISO()}
                        max={toISODate(maxDate)}
                        value={entry.date}
                        onChange={(event) => {
                          const date = event.target.value;
                          setDraft((previous) =>
                            previous.map((item) =>
                              item.id === entry.id ? { ...item, date } : item,
                            ),
                          );
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor={`${prefix}-items`}
                      className="text-xs text-muted-foreground"
                    >
                      Skład zestawu (jeden składnik w wierszu)
                    </label>
                    <textarea
                      id={`${prefix}-items`}
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                      rows={3}
                      value={entry.dish.items.join("\n")}
                      onChange={(event) =>
                        edit(entry.id, {
                          items:
                            event.target.value === ""
                              ? []
                              : event.target.value.split("\n"),
                        })
                      }
                    />
                  </div>
                  {invalid.has(entry.id) && (
                    <p className="text-sm text-destructive" role="alert">
                      Uzupełnij nazwę i poprawną cenę (0,01–9999,99 PLN), datę
                      (dziś–30 dni) oraz skład (maks. 10 pozycji po 200 znaków).
                      Sprawdź też opis i metadane lub wyklucz tę ofertę.
                    </p>
                  )}
                </fieldset>
              );
            })}
          </section>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
        {overLimit && (
          <p className="w-full text-sm text-destructive" role="alert">
            {OFFER_BATCH_LIMIT_MESSAGE}
          </p>
        )}
        <span className="text-sm text-muted-foreground">
          Wybrano {selected.length} z {draft.length} ofert
        </span>
        <Button
          type="button"
          disabled={
            isSubmitting ||
            selected.length === 0 ||
            invalid.size > 0 ||
            overLimit
          }
          onClick={() => {
            if (
              isSubmitting ||
              selected.length === 0 ||
              invalid.size > 0 ||
              overLimit
            )
              return;
            onConfirm(
              selected.map(({ dish, date }) => ({
                dish: {
                  ...dish,
                  name: dish.name?.trim() ?? null,
                  items: dish.items.map((item) => item.trim()).filter(Boolean),
                },
                date,
              })),
            );
          }}
        >
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {isSubmitting
            ? "Publikowanie..."
            : `Opublikuj ${selected.length} ${selectedNoun}`}
        </Button>
      </div>
    </div>
  );
}
