"use client";

import * as React from "react";
import { FilterToolbar, FilterPanel } from "@/components/filters/FilterControls";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup, Field, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Sheet } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { cuisineLabels } from "@/lib/display-labels";
import { cuisineTypeValues, priceLevelValues } from "@/schemas/restaurant.schema";
import type { RestaurantFilters as RestaurantFiltersType } from "@/types/restaurants";
import type { Coordinates } from "@/types/offers";

const priceLabels = { budżetowa: "Budżetowa", średnia: "Średnia", premium: "Premium" };

interface RestaurantFiltersProps {
  filters: RestaurantFiltersType;
  onChange: (filters: RestaurantFiltersType) => void;
  userLocation?: Coordinates;
}

export function RestaurantFilters({ filters, onChange, userLocation }: RestaurantFiltersProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState(filters.searchQuery ?? "");
  const [draft, setDraft] = React.useState<RestaurantFiltersType>(filters);
  const debounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const committed = React.useRef(filters);
  committed.current = filters;

  React.useEffect(() => setSearchQuery(filters.searchQuery ?? ""), [filters.searchQuery]);
  React.useEffect(() => () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  }, []);

  const cancelSearch = () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  };

  const withSearch = (criteria: RestaurantFiltersType, query: string): RestaurantFiltersType => {
    const next = { ...criteria };
    delete next.page;
    if (query.length >= 2) next.searchQuery = query;
    else delete next.searchQuery;
    return next;
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    cancelSearch();
    debounceTimer.current = setTimeout(() => onChange(withSearch(committed.current, query)), 300);
  };

  const changePanel = (open: boolean) => {
    if (open) {
      cancelSearch();
      // Finish pending search without leaking uncommitted panel selections.
      const next = withSearch(filters, searchQuery);
      if (next.searchQuery !== filters.searchQuery) onChange(next);
      setDraft(next);
    }
    setIsOpen(open);
  };

  const criteria = [
    ...(filters.priceLevels ?? []).map(value => ({ key: `price:${value}`, label: priceLabels[value] })),
    ...(filters.cuisineTypes ?? []).map(value => ({ key: `cuisine:${value}`, label: cuisineLabels[value] })),
    ...(filters.distance ? [{ key: "radius", label: `Do ${filters.distance.radius} km` }] : []),
    ...(filters.lunchTimeAt ? [{ key: "time", label: `Lunch o ${filters.lunchTimeAt}` }] : []),
  ];

  const removeCriterion = (key: string) => {
    cancelSearch();
    const next = withSearch(filters, searchQuery);
    if (key.startsWith("price:")) {
      next.priceLevels = filters.priceLevels?.filter(value => value !== key.slice(6));
      if (!next.priceLevels?.length) delete next.priceLevels;
    }
    if (key.startsWith("cuisine:")) {
      next.cuisineTypes = filters.cuisineTypes?.filter(value => value !== key.slice(8));
      if (!next.cuisineTypes?.length) delete next.cuisineTypes;
    }
    if (key === "radius") delete next.distance;
    if (key === "time") delete next.lunchTimeAt;
    onChange(next);
  };

  return <Sheet open={isOpen} onOpenChange={changePanel}>
    <FilterToolbar searchLabel="Szukaj restauracji" searchPlaceholder="Szukaj restauracji (min. 2 znaki)…"
      searchQuery={searchQuery} onSearchChange={handleSearchChange} criteria={criteria}
      onRemove={removeCriterion} clearDisabled={criteria.length === 0 && searchQuery.length < 2}
      onClear={() => { cancelSearch(); setSearchQuery(""); onChange({}); }} />
    <FilterPanel title="Restauracja na Twoją przerwę" submitLabel="Pokaż restauracje"
      onCancel={() => changePanel(false)} onSubmit={event => {
        event.preventDefault();
        cancelSearch();
        const next = withSearch(draft, searchQuery);
        if (next.distance && userLocation) next.distance = { ...next.distance, from: userLocation };
        onChange(next);
        setIsOpen(false);
      }}>
      <FieldGroup className="px-4">
        {userLocation && <Field>
          <FieldLabel htmlFor="restaurant-distance-slider">Odległość: {draft.distance?.radius ?? 10} km</FieldLabel>
          <Slider id="restaurant-distance-slider" min={0.5} max={25} step={0.5} value={[draft.distance?.radius ?? 10]}
            onValueChange={([radius]) => setDraft(previous => ({ ...previous, distance: { radius, from: userLocation } }))}
            aria-label={`Maksymalna odległość: ${draft.distance?.radius ?? 10} km`} />
        </Field>}
        <FieldSet>
          <FieldLegend>Poziom cenowy</FieldLegend>
          <ToggleGroup type="multiple" variant="outline" spacing={2} className="flex-wrap" aria-label="Poziom cenowy"
            value={draft.priceLevels ?? []} onValueChange={values => setDraft(previous => ({
              ...previous, priceLevels: priceLevelValues.filter(value => values.includes(value)),
            }))}>
            {priceLevelValues.map(value => <ToggleGroupItem key={value} value={value}>{priceLabels[value]}</ToggleGroupItem>)}
          </ToggleGroup>
        </FieldSet>
        <FieldSet>
          <FieldLegend>Typ kuchni</FieldLegend>
          <FieldGroup className="grid grid-cols-2 gap-3">
            {cuisineTypeValues.map(value => <Field key={value} orientation="horizontal">
              <Checkbox id={`restaurant-cuisine-${value}`} checked={draft.cuisineTypes?.includes(value) ?? false}
                onCheckedChange={checked => setDraft(previous => ({ ...previous, cuisineTypes: checked
                  ? [...(previous.cuisineTypes ?? []), value]
                  : previous.cuisineTypes?.filter(cuisine => cuisine !== value),
                }))} />
              <FieldLabel className="min-w-0 [overflow-wrap:anywhere]" htmlFor={`restaurant-cuisine-${value}`}>{cuisineLabels[value]}</FieldLabel>
            </Field>)}
          </FieldGroup>
        </FieldSet>
        <Field>
          <FieldLabel htmlFor="restaurant-lunch-time">Serwuje lunch o</FieldLabel>
          <Input id="restaurant-lunch-time" type="time" min="06:00" max="23:00" value={draft.lunchTimeAt ?? ""}
            onChange={event => setDraft(previous => ({ ...previous, lunchTimeAt: event.target.value || undefined }))}
            aria-label="Godzina serwowania lunchu" />
        </Field>
      </FieldGroup>
    </FilterPanel>
  </Sheet>;
}
