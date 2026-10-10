"use client";

import * as React from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { RestaurantFilters as RestaurantFiltersType, PriceLevel } from "@/types/restaurants";
import type { Coordinates, CuisineType } from "@/types/offers";

const PRICE_LEVELS: { value: PriceLevel; label: string }[] = [
  { value: "budżetowa", label: "Budżetowa" },
  { value: "średnia", label: "Średnia" },
  { value: "premium", label: "Premium" },
];

const CUISINE_TYPES: { value: CuisineType; label: string }[] = [
  { value: "polska", label: "Polska" },
  { value: "wloska", label: "Włoska" },
  { value: "azjatycka", label: "Azjatycka" },
  { value: "meksykanska", label: "Meksykańska" },
  { value: "amerykanska", label: "Amerykańska" },
  { value: "indyjska", label: "Indyjska" },
  { value: "srodziemnomorska", label: "Śródziemnomorska" },
  { value: "inne", label: "Inne" },
];

interface RestaurantFiltersProps {
  filters: RestaurantFiltersType;
  onChange: (filters: RestaurantFiltersType) => void;
  userLocation?: Coordinates;
}

export function RestaurantFilters({
  filters,
  onChange,
  userLocation,
}: RestaurantFiltersProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState(filters.searchQuery ?? "");
  const [distance, setDistance] = React.useState(filters.distance?.radius ?? 10);
  const [priceLevels, setPriceLevels] = React.useState<PriceLevel[]>(filters.priceLevels ?? []);
  const [cuisineTypes, setCuisineTypes] = React.useState<CuisineType[]>(filters.cuisineTypes ?? []);
  const [lunchTimeAt, setLunchTimeAt] = React.useState(filters.lunchTimeAt ?? "");

  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildFilters = React.useCallback(
    (overrides?: Partial<{
      searchQuery: string;
      distance: number;
      priceLevels: PriceLevel[];
      cuisineTypes: CuisineType[];
      lunchTimeAt: string;
    }>) => {
      const q = overrides?.searchQuery ?? searchQuery;
      const d = overrides?.distance ?? distance;
      const pl = overrides?.priceLevels ?? priceLevels;
      const ct = overrides?.cuisineTypes ?? cuisineTypes;
      const lt = overrides?.lunchTimeAt ?? lunchTimeAt;

      const newFilters: RestaurantFiltersType = {};
      if (q.length >= 2) newFilters.searchQuery = q;
      if (userLocation && d > 0) newFilters.distance = { radius: d, from: userLocation };
      if (pl.length > 0) newFilters.priceLevels = pl;
      if (ct.length > 0) newFilters.cuisineTypes = ct;
      if (lt) newFilters.lunchTimeAt = lt;
      return newFilters;
    },
    [searchQuery, distance, priceLevels, cuisineTypes, lunchTimeAt, userLocation]
  );

  const emitChange = React.useCallback(
    (overrides?: Parameters<typeof buildFilters>[0]) => {
      onChange(buildFilters(overrides));
    },
    [onChange, buildFilters]
  );

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      emitChange({ searchQuery: value });
    }, 300);
  };

  React.useEffect(() => {
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, []);

  const handleDistanceChange = (value: number[]) => {
    const newDistance = value[0];
    setDistance(newDistance);
    emitChange({ distance: newDistance });
  };

  const handlePriceLevelToggle = (level: PriceLevel) => {
    const updated = priceLevels.includes(level)
      ? priceLevels.filter((l) => l !== level)
      : [...priceLevels, level];
    setPriceLevels(updated);
    emitChange({ priceLevels: updated });
  };

  const handleCuisineToggle = (cuisine: CuisineType) => {
    const updated = cuisineTypes.includes(cuisine)
      ? cuisineTypes.filter((c) => c !== cuisine)
      : [...cuisineTypes, cuisine];
    setCuisineTypes(updated);
    emitChange({ cuisineTypes: updated });
  };

  const handleLunchTimeChange = (value: string) => {
    setLunchTimeAt(value);
    emitChange({ lunchTimeAt: value });
  };

  const hasActiveFilters =
    searchQuery.length >= 2 ||
    (userLocation && distance !== 10) ||
    priceLevels.length > 0 ||
    cuisineTypes.length > 0 ||
    lunchTimeAt !== "";

  const handleClearFilters = () => {
    setSearchQuery("");
    setDistance(10);
    setPriceLevels([]);
    setCuisineTypes([]);
    setLunchTimeAt("");
    onChange({});
  };

  return (
    <div className="w-full space-y-4">
      {/* Search row */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Szukaj restauracji (min. 2 znaki)..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 bg-card border-border focus:border-primary"
            aria-label="Szukaj restauracji"
          />
        </div>

        {/* Mobile toggle */}
        <Button
          variant="outline"
          size="sm"
          className="md:hidden"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-controls="restaurant-filters-panel"
          aria-label={isOpen ? "Ukryj filtry" : "Pokaż filtry"}
        >
          <SlidersHorizontal className="size-4" />
          Filtry
        </Button>
      </div>

      {/* Filters panel */}
      <div
        id="restaurant-filters-panel"
        className={cn(
          "rounded-md border border-border bg-card p-5",
          isOpen ? "block" : "hidden md:block"
        )}
      >
        {/* Clear button */}
        {hasActiveFilters && (
          <div className="flex justify-end mb-4">
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              <X className="size-3.5" />
              Wyczyść filtry
            </Button>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Distance slider */}
          {userLocation && (
            <div className="space-y-3">
              <Label className="text-base font-medium uppercase tracking-wider text-muted-foreground">
                Odległość: {distance} km
              </Label>
              <Slider
                min={0.5}
                max={25}
                step={0.5}
                value={[distance]}
                onValueChange={handleDistanceChange}
                aria-label={`Maksymalna odległość: ${distance} km`}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0.5 km</span>
                <span>25 km</span>
              </div>
            </div>
          )}

          {/* Price level */}
          <div className="space-y-3">
            <Label className="text-base font-medium uppercase tracking-wider text-muted-foreground">
              Poziom cenowy
            </Label>
            <div className="flex flex-wrap gap-2">
              {PRICE_LEVELS.map((level) => {
                const active = priceLevels.includes(level.value);
                return (
                  <Chip
                    key={level.value}
                    active={active}
                    onClick={() => handlePriceLevelToggle(level.value)}
                  >
                    {level.label}
                  </Chip>
                );
              })}
            </div>
          </div>

          {/* Cuisine types */}
          <div className="space-y-3 md:col-span-2 lg:col-span-1">
            <Label className="text-base font-medium uppercase tracking-wider text-muted-foreground">
              Typ kuchni
            </Label>
            <div className="flex flex-wrap gap-2">
              {CUISINE_TYPES.map((cuisine) => {
                const active = cuisineTypes.includes(cuisine.value);
                return (
                  <Chip
                    key={cuisine.value}
                    active={active}
                    onClick={() => handleCuisineToggle(cuisine.value)}
                  >
                    {cuisine.label}
                  </Chip>
                );
              })}
            </div>
          </div>

          {/* Lunch time */}
          <div className="space-y-3">
            <Label className="text-base font-medium uppercase tracking-wider text-muted-foreground">
              Serwuje lunch o
            </Label>
            <Input
              type="time"
              value={lunchTimeAt}
              onChange={(e) => handleLunchTimeChange(e.target.value)}
              min="06:00"
              max="23:00"
              className="bg-card border-border focus:border-primary"
              aria-label="Godzina serwowania lunchu"
            />
            {lunchTimeAt && (
              <p className="text-xs text-muted-foreground">
                Restauracje serwujące o {lunchTimeAt}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
