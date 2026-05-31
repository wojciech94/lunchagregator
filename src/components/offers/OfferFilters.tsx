"use client";

import * as React from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type { OfferFilters as OfferFiltersType } from "@/types/filters";
import type { Coordinates, CuisineType, DietaryTag } from "@/types/offers";

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

const DIETARY_TAGS: { value: DietaryTag; label: string }[] = [
  { value: "vegetarian", label: "Wegetariańskie" },
  { value: "vegan", label: "Wegańskie" },
  { value: "gluten-free", label: "Bezglutenowe" },
  { value: "dairy-free", label: "Bez nabiału" },
  { value: "keto", label: "Keto" },
];

const SORT_OPTIONS: { value: OfferFiltersType["sortBy"]; label: string }[] = [
  { value: "price_asc", label: "Cena rosnąco" },
  { value: "price_desc", label: "Cena malejąco" },
  { value: "distance", label: "Odległość" },
  { value: "newest", label: "Najnowsze" },
];

interface OfferFiltersProps {
  onChange: (filters: OfferFiltersType) => void;
  userLocation?: Coordinates | null;
  initialFilters?: Partial<OfferFiltersType>;
}

export function OfferFilters({
  onChange,
  userLocation,
  initialFilters,
}: OfferFiltersProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState(
    initialFilters?.searchQuery ?? ""
  );
  const [distance, setDistance] = React.useState(
    initialFilters?.distance?.radius ?? 10
  );
  const [priceMin, setPriceMin] = React.useState(
    initialFilters?.price?.min?.toString() ?? ""
  );
  const [priceMax, setPriceMax] = React.useState(
    initialFilters?.price?.max?.toString() ?? ""
  );
  const [cuisineTypes, setCuisineTypes] = React.useState<CuisineType[]>(
    initialFilters?.cuisineTypes ?? []
  );
  const [dietaryTags, setDietaryTags] = React.useState<DietaryTag[]>(
    initialFilters?.dietaryTags ?? []
  );
  const [sortBy, setSortBy] = React.useState<OfferFiltersType["sortBy"]>(
    initialFilters?.sortBy ?? "newest"
  );

  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const buildFilters = React.useCallback(
    (overrides?: Partial<{
      searchQuery: string;
      distance: number;
      priceMin: string;
      priceMax: string;
      cuisineTypes: CuisineType[];
      dietaryTags: DietaryTag[];
      sortBy: OfferFiltersType["sortBy"];
    }>) => {
      const q = overrides?.searchQuery ?? searchQuery;
      const d = overrides?.distance ?? distance;
      const pMin = overrides?.priceMin ?? priceMin;
      const pMax = overrides?.priceMax ?? priceMax;
      const ct = overrides?.cuisineTypes ?? cuisineTypes;
      const dt = overrides?.dietaryTags ?? dietaryTags;
      const sb = overrides?.sortBy ?? sortBy;

      const filters: OfferFiltersType = {};

      if (q.length >= 2) {
        filters.searchQuery = q;
      }

      if (userLocation && d > 0) {
        filters.distance = { radius: d, from: userLocation };
      }

      const minVal = parseFloat(pMin);
      const maxVal = parseFloat(pMax);
      if (!isNaN(minVal) || !isNaN(maxVal)) {
        filters.price = {
          min: !isNaN(minVal) ? Math.max(0.01, Math.min(999.99, minVal)) : 0.01,
          max: !isNaN(maxVal) ? Math.max(0.01, Math.min(999.99, maxVal)) : 999.99,
        };
      }

      if (ct.length > 0) {
        filters.cuisineTypes = ct;
      }

      if (dt.length > 0) {
        filters.dietaryTags = dt;
      }

      if (sb) {
        filters.sortBy = sb;
      }

      return filters;
    },
    [searchQuery, distance, priceMin, priceMax, cuisineTypes, dietaryTags, sortBy, userLocation]
  );

  const emitChange = React.useCallback(
    (overrides?: Parameters<typeof buildFilters>[0]) => {
      onChange(buildFilters(overrides));
    },
    [onChange, buildFilters]
  );

  // Debounced search
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      emitChange({ searchQuery: value });
    }, 300);
  };

  // Cleanup debounce timer
  React.useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleDistanceChange = (value: number[]) => {
    const newDistance = value[0];
    setDistance(newDistance);
    emitChange({ distance: newDistance });
  };

  const handlePriceMinChange = (value: string) => {
    setPriceMin(value);
    emitChange({ priceMin: value });
  };

  const handlePriceMaxChange = (value: string) => {
    setPriceMax(value);
    emitChange({ priceMax: value });
  };

  const handleCuisineToggle = (cuisine: CuisineType) => {
    const updated = cuisineTypes.includes(cuisine)
      ? cuisineTypes.filter((c) => c !== cuisine)
      : [...cuisineTypes, cuisine];
    setCuisineTypes(updated);
    emitChange({ cuisineTypes: updated });
  };

  const handleDietaryToggle = (tag: DietaryTag) => {
    const updated = dietaryTags.includes(tag)
      ? dietaryTags.filter((t) => t !== tag)
      : [...dietaryTags, tag];
    setDietaryTags(updated);
    emitChange({ dietaryTags: updated });
  };

  const handleSortChange = (value: string) => {
    const newSort = value as OfferFiltersType["sortBy"];
    setSortBy(newSort);
    emitChange({ sortBy: newSort });
  };

  const hasActiveFilters =
    searchQuery.length >= 2 ||
    (userLocation && distance !== 10) ||
    priceMin !== "" ||
    priceMax !== "" ||
    cuisineTypes.length > 0 ||
    dietaryTags.length > 0;

  const handleClearFilters = () => {
    setSearchQuery("");
    setDistance(10);
    setPriceMin("");
    setPriceMax("");
    setCuisineTypes([]);
    setDietaryTags([]);
    setSortBy("newest");
    onChange({ sortBy: "newest" });
  };

  return (
    <div className="w-full space-y-4">
      {/* Search and mobile toggle row */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Szukaj dań (min. 2 znaki)..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
            aria-label="Szukaj ofert"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={handleSortChange}>
            <SelectTrigger className="w-[180px]" aria-label="Sortowanie">
              <SelectValue placeholder="Sortuj" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value!}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Mobile toggle button */}
          <Button
            variant="outline"
            size="default"
            className="md:hidden min-w-[44px] min-h-[44px]"
            onClick={() => setIsOpen(!isOpen)}
            aria-expanded={isOpen}
            aria-controls="offer-filters-panel"
            aria-label={isOpen ? "Ukryj filtry" : "Pokaż filtry"}
          >
            <SlidersHorizontal className="size-4" />
            <span className="ml-1">Filtry</span>
          </Button>
        </div>
      </div>

      {/* Filters panel - collapsible on mobile */}
      <div
        id="offer-filters-panel"
        className={cn(
          "space-y-6 rounded-md border border-border bg-card p-5 shadow-[0_1.2px_0_0_rgba(0,0,0,0.03)]",
          isOpen ? "block" : "hidden md:block"
        )}
      >
        {/* Clear filters button */}
        {hasActiveFilters && (
          <div className="flex justify-end">
            <button
              onClick={handleClearFilters}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-3" />
              Wyczyść filtry
            </button>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Distance slider - only shown when user location is available */}
          {userLocation && (
            <div className="space-y-3">
              <Label htmlFor="distance-slider" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Odległość: {distance} km
              </Label>
              <Slider
                id="distance-slider"
                min={0.5}
                max={25}
                step={0.5}
                value={[distance]}
                onValueChange={handleDistanceChange}
                aria-label={`Maksymalna odległość: ${distance} km`}
              />
              <div className="flex justify-between text-xs text-muted-foreground/60">
                <span>0.5 km</span>
                <span>25 km</span>
              </div>
            </div>
          )}

          {/* Price range */}
          <div className="space-y-3">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Zakres cen (PLN)
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Min"
                value={priceMin}
                onChange={(e) => handlePriceMinChange(e.target.value)}
                min={0.01}
                max={999.99}
                step={0.01}
                className="w-full bg-card border-border focus:border-primary"
                aria-label="Cena minimalna"
              />
              <span className="text-muted-foreground">—</span>
              <Input
                type="number"
                placeholder="Max"
                value={priceMax}
                onChange={(e) => handlePriceMaxChange(e.target.value)}
                min={0.01}
                max={999.99}
                step={0.01}
                className="w-full bg-card border-border focus:border-primary"
                aria-label="Cena maksymalna"
              />
            </div>
          </div>

          {/* Cuisine type multi-select */}
          <div className="space-y-3 md:col-span-2 lg:col-span-1">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Typ kuchni
            </Label>
            <div className="flex flex-wrap gap-2">
              {CUISINE_TYPES.map((cuisine) => {
                const active = cuisineTypes.includes(cuisine.value);
                return (
                  <button
                    key={cuisine.value}
                    type="button"
                    onClick={() => handleCuisineToggle(cuisine.value)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    )}
                  >
                    {cuisine.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dietary tags multi-select */}
          <div className="space-y-3 md:col-span-2 lg:col-span-1">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Dieta
            </Label>
            <div className="flex flex-wrap gap-2">
              {DIETARY_TAGS.map((tag) => {
                const active = dietaryTags.includes(tag.value);
                return (
                  <button
                    key={tag.value}
                    type="button"
                    onClick={() => handleDietaryToggle(tag.value)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    )}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
