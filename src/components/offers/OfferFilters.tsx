"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FieldGroup, Field, FieldLabel, FieldSet, FieldLegend, FieldError } from "@/components/ui/field";
import { FilterToolbar, FilterPanel } from "@/components/filters/FilterControls";
import { Sheet } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { priceFilterSchema } from "@/lib/validations/filters";
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

/**
 * What the sort control shows, and what "clear filters" restores.
 *
 * `undefined` rather than a literal, because with no user location there is no
 * distance to sort by and Requirement 1.2 wants alphabetical by restaurant name.
 * `newest` was used here before, which meant both the initial control state and
 * a filter reset produced a newest-first list for anyone without a location --
 * so the control claimed one order while the list, once the competing sorts
 * were removed, followed another.
 *
 * `undefined` is also what `listOffers` needs to apply that fallback: it only
 * reaches for `restaurant_name` when no sortBy was asked for.
 */
const DEFAULT_SORT: OfferFiltersType["sortBy"] = undefined;

interface OfferFiltersProps {
  onChange: (filters: OfferFiltersType, options?: { clearRadius?: boolean }) => void;
  onReset?: () => void;
  initialRadius?: number;
  /**
   * Search text, on its own channel and on its own clock.
   *
   * Typing is not a filter the User has committed to, so it debounces and
   * replaces the history entry rather than pushing one per keystroke. Chips,
   * price, sort and day push instead, which is what makes Back undo them.
   */
  onSearchChange?: (filters: OfferFiltersType) => void;
  userLocation?: Coordinates | null;
  initialFilters?: Partial<OfferFiltersType>;
}

export function OfferFilters({
  onChange,
  onReset,
  initialRadius,
  onSearchChange,
  userLocation,
  initialFilters,
}: OfferFiltersProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState(
    initialFilters?.searchQuery ?? ""
  );
  const [distance, setDistance] = React.useState(
    initialFilters?.distance?.radius ?? initialRadius ?? 10
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
    initialFilters?.sortBy ?? DEFAULT_SORT
  );

  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const searchRevision = React.useRef(0);
  const draftSnapshot = React.useRef({ searchQuery, distance, priceMin, priceMax, cuisineTypes, dietaryTags, sortBy });
  const searchNavigations = React.useRef<{ query: string | null; context: string; revision: number }[]>([]);

  // Follow the URL. Without this the form keeps whatever was typed while the
  // list changes underneath it, and Back moves the list without moving the
  // controls -- which is the form disagreeing with the page it filters, the
  // failure that having one source of truth is meant to prevent.
  //
  // Keyed on a serialised value rather than the object, because the filters
  // object is rebuilt on every navigation.
  const incoming = JSON.stringify({
    q: initialFilters?.searchQuery ?? null,
    d: initialFilters?.distance?.radius ?? initialRadius ?? null,
    min: initialFilters?.price?.min ?? null,
    max: initialFilters?.price?.max ?? null,
    ct: initialFilters?.cuisineTypes ?? [],
    dt: initialFilters?.dietaryTags ?? [],
    sort: initialFilters?.sortBy ?? null,
    date: initialFilters?.date ?? null,
    page: initialFilters?.page ?? null,
  });
  const searchContext = JSON.stringify({ ...JSON.parse(incoming), q: null, page: null });

  React.useEffect(() => {
    const next = JSON.parse(incoming) as {
      q: string | null;
      d: number | null;
      min: number | null;
      max: number | null;
      ct: CuisineType[];
      dt: DietaryTag[];
      sort: OfferFiltersType["sortBy"];
    };
    const context = JSON.stringify({ ...JSON.parse(incoming), q: null, page: null });
    const acknowledged = searchNavigations.current.findIndex(request =>
      request.query === next.q && request.context === context
    );
    const preserveDraft = acknowledged >= 0 &&
      searchNavigations.current[acknowledged].revision < searchRevision.current;
    if (acknowledged >= 0) searchNavigations.current.splice(0, acknowledged + 1);
    else searchNavigations.current = [];

    if (!preserveDraft) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      setSearchQuery(next.q ?? "");
    }
    setDistance(next.d ?? 10);
    setPriceMin(next.min?.toString() ?? "");
    setPriceMax(next.max?.toString() ?? "");
    setCuisineTypes(next.ct);
    setDietaryTags(next.dt);
    setSortBy(next.sort ?? DEFAULT_SORT);
    setIsOpen(false);
  }, [incoming]);

  React.useEffect(() => {
    // Back/Forward is authoritative, even if it visits a query that is also
    // awaiting an acknowledgement from one of our own search navigations.
    const onPopState = () => {
      searchNavigations.current = [];
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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
      const sb = overrides && "sortBy" in overrides ? overrides.sortBy : sortBy;

      const filters: OfferFiltersType = {};

      if (q.length >= 2) {
        filters.searchQuery = q;
      }

      const distanceChosen = initialRadius !== undefined || initialFilters?.distance ||
        overrides?.distance !== undefined || d !== 10;
      if (userLocation && d > 0 && distanceChosen) {
        filters.distance = { radius: d, from: userLocation };
      }

      const minVal = parseFloat(pMin);
      const maxVal = parseFloat(pMax);
      if (!isNaN(minVal) || !isNaN(maxVal)) {
        filters.price = {
          min: !isNaN(minVal) ? minVal : 0.01,
          max: !isNaN(maxVal) ? maxVal : 999.99,
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
    [searchQuery, distance, priceMin, priceMax, cuisineTypes, dietaryTags, sortBy, userLocation, initialRadius, initialFilters?.distance]
  );

  const emitChange = React.useCallback(
    (overrides?: Parameters<typeof buildFilters>[0]) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      searchNavigations.current = [];
      if (isOpen) return;
      onChange(buildFilters(overrides));
    },
    [onChange, buildFilters, isOpen]
  );

  // Debounced search
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    const revision = ++searchRevision.current;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const nextFilters = buildFilters({ searchQuery: value });
      searchNavigations.current.push({ query: nextFilters.searchQuery ?? null, context: searchContext, revision });
      // On its own channel when the caller provides one: typing replaces the
      // URL, it does not push a history entry per keystroke.
      if (onSearchChange) {
        onSearchChange(nextFilters);
      } else {
        onChange(nextFilters);
      }
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

  const handleSortChange = (value: string) => {
    const newSort = value === "default" ? undefined : value as OfferFiltersType["sortBy"];
    setSortBy(newSort);
    emitChange({ sortBy: newSort });
  };

  const hasActiveFilters =
    searchQuery.length >= 2 ||
    sortBy !== undefined ||
    initialRadius !== undefined ||
    (userLocation && distance !== 10) ||
    priceMin !== "" ||
    priceMax !== "" ||
    cuisineTypes.length > 0 ||
    dietaryTags.length > 0;

  const handleClearFilters = () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    searchNavigations.current = [];
    setSearchQuery("");
    setDistance(10);
    setPriceMin("");
    setPriceMax("");
    setCuisineTypes([]);
    setDietaryTags([]);
    setSortBy(DEFAULT_SORT);
    // No sortBy key at all, rather than an explicit value: `listOffers` only
    // applies the alphabetical fallback when none was requested, so sending
    // "newest" here would restore a newest-first list on a filter reset.
    if (onReset) onReset();
    else onChange({});
  };

  const parsedPrice = priceFilterSchema.safeParse({
    min: priceMin === "" ? 0.01 : Number(priceMin),
    max: priceMax === "" ? 999.99 : Number(priceMax),
  });
  const priceError = parsedPrice.success ? undefined : parsedPrice.error.issues[0].message;

  const committed = initialFilters ?? {};
  const activeCriteria = [
    ...(committed.price ? [{ key: "price", label: `${committed.price.min}–${committed.price.max} zł` }] : []),
    ...(committed.cuisineTypes ?? []).map(value => ({ key: `cuisine:${value}`, label: CUISINE_TYPES.find(c => c.value === value)!.label })),
    ...(committed.dietaryTags ?? []).map(value => ({ key: `diet:${value}`, label: DIETARY_TAGS.find(d => d.value === value)!.label })),
    ...(initialRadius !== undefined ? [{ key: "radius", label: `Do ${initialRadius} km` }] : []),
  ];

  const changePanel = (open: boolean) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (open) {
      draftSnapshot.current = { searchQuery, distance, priceMin, priceMax, cuisineTypes, dietaryTags, sortBy };
    } else {
      const saved = draftSnapshot.current;
      setDistance(saved.distance); setPriceMin(saved.priceMin); setPriceMax(saved.priceMax);
      setCuisineTypes(saved.cuisineTypes); setDietaryTags(saved.dietaryTags);
      if (saved.searchQuery !== (initialFilters?.searchQuery ?? "")) handleSearchChange(saved.searchQuery);
    }
    setIsOpen(open);
  };

  const removeCriterion = (key: string) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    searchNavigations.current = [];
    const next = buildFilters();
    if (key === "price") { delete next.price; setPriceMin(""); setPriceMax(""); }
    if (key.startsWith("cuisine:")) { next.cuisineTypes = cuisineTypes.filter(v => v !== key.slice(8)); setCuisineTypes(next.cuisineTypes); }
    if (key.startsWith("diet:")) { next.dietaryTags = dietaryTags.filter(v => v !== key.slice(5)); setDietaryTags(next.dietaryTags); }
    if (key === "radius") { delete next.distance; setDistance(10); }
    onChange(next, { clearRadius: key === "radius" });
  };

  return (
    <Sheet open={isOpen} onOpenChange={changePanel}>
      <FilterToolbar searchLabel="Szukaj ofert" searchPlaceholder="Szukaj dań (min. 2 znaki)…"
        searchQuery={searchQuery} onSearchChange={handleSearchChange} criteria={activeCriteria}
        onRemove={removeCriterion} onClear={handleClearFilters} clearDisabled={!hasActiveFilters}
        sortControl={<Select value={sortBy ?? "default"} onValueChange={handleSortChange}>
              <SelectTrigger className="w-[180px]" aria-label="Sortowanie"><SelectValue placeholder="Sortuj" /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="default">{userLocation ? "Najbliżej" : "Restauracja A–Z"}</SelectItem>
                {SORT_OPTIONS.map(option => <SelectItem key={option.value} value={option.value!}>{option.label}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>} />
      {priceError && !isOpen && <FieldError>{priceError}</FieldError>}
      <FilterPanel title="Twój lunch, Twoje zasady" submitLabel="Pokaż oferty"
        onCancel={() => changePanel(false)} submitDisabled={!!priceError}
        onSubmit={event => {
          event.preventDefault();
          if (priceError) return;
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          searchNavigations.current = [];
          onChange(buildFilters()); setIsOpen(false);
        }}>
          <FieldGroup className="px-4">
            {userLocation && <Field>
              <FieldLabel htmlFor="distance-slider">Odległość: {distance} km</FieldLabel>
              <Slider id="distance-slider" min={0.5} max={25} step={0.5} value={[distance]}
                onValueChange={handleDistanceChange} aria-label={`Maksymalna odległość: ${distance} km`} />
            </Field>}
            <FieldSet>
              <FieldLegend>Zakres cen (PLN)</FieldLegend>
              <FieldGroup className="grid grid-cols-2 gap-3">
                <Field data-invalid={!!priceError}>
                  <FieldLabel htmlFor="offer-price-min">Od</FieldLabel>
                  <Input id="offer-price-min" type="number" placeholder="Min" value={priceMin}
                    onChange={e => handlePriceMinChange(e.target.value)} min={0.01} max={999.99} step={0.01}
                    aria-label="Cena minimalna" aria-invalid={!!priceError} aria-describedby={priceError ? "offer-price-error" : undefined} />
                </Field>
                <Field data-invalid={!!priceError}>
                  <FieldLabel htmlFor="offer-price-max">Do</FieldLabel>
                  <Input id="offer-price-max" type="number" placeholder="Max" value={priceMax}
                    onChange={e => handlePriceMaxChange(e.target.value)} min={0.01} max={999.99} step={0.01}
                    aria-label="Cena maksymalna" aria-invalid={!!priceError} aria-describedby={priceError ? "offer-price-error" : undefined} />
                </Field>
              </FieldGroup>
              {priceError && <FieldError id="offer-price-error">{priceError}</FieldError>}
            </FieldSet>
            <FieldSet>
              <FieldLegend>Typ kuchni</FieldLegend>
              <FieldGroup className="grid grid-cols-2 gap-3">
                {CUISINE_TYPES.map(cuisine => <Field key={cuisine.value} orientation="horizontal">
                  <Checkbox id={`cuisine-${cuisine.value}`} checked={cuisineTypes.includes(cuisine.value)}
                    onCheckedChange={() => handleCuisineToggle(cuisine.value)} />
                  <FieldLabel className="min-w-0 [overflow-wrap:anywhere]" htmlFor={`cuisine-${cuisine.value}`}>{cuisine.label}</FieldLabel>
                </Field>)}
              </FieldGroup>
            </FieldSet>
            <FieldSet>
              <FieldLegend>Dieta</FieldLegend>
              <ToggleGroup type="multiple" value={dietaryTags} variant="outline" spacing={2} className="flex-wrap"
                aria-label="Dieta" onValueChange={values => {
                  const next = values as DietaryTag[];
                  setDietaryTags(next); emitChange({ dietaryTags: next });
                }}>
                {DIETARY_TAGS.map(tag => <ToggleGroupItem key={tag.value} value={tag.value}>{tag.label}</ToggleGroupItem>)}
              </ToggleGroup>
            </FieldSet>
          </FieldGroup>
      </FilterPanel>
    </Sheet>
  );
}
