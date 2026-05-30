"use client";

import * as React from "react";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchRestaurants } from "@/actions/restaurants";
import type { RestaurantSummary } from "@/types/restaurants";

// ============================================================================
// Types
// ============================================================================

export interface RestaurantSelectProps {
  onSelect: (restaurant: RestaurantSummary | null) => void;
  selectedId?: string;
}

// ============================================================================
// Component
// ============================================================================

export function RestaurantSelect({ onSelect, selectedId }: RestaurantSelectProps) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<RestaurantSummary[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<RestaurantSummary | null>(null);
  const [hasSearched, setHasSearched] = React.useState(false);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search
  React.useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);

    debounceRef.current = setTimeout(async () => {
      const data = await searchRestaurants(query.trim());
      setResults(data);
      setIsLoading(false);
      setHasSearched(true);
      setIsOpen(true);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  function handleSelect(restaurant: RestaurantSummary) {
    setSelected(restaurant);
    setQuery("");
    setResults([]);
    setIsOpen(false);
    setHasSearched(false);
    onSelect(restaurant);
  }

  function handleClear() {
    setSelected(null);
    setQuery("");
    setResults([]);
    setIsOpen(false);
    setHasSearched(false);
    onSelect(null);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    if (e.target.value.trim().length >= 2) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }

  function handleInputFocus() {
    if (results.length > 0 || (hasSearched && query.trim().length >= 2)) {
      setIsOpen(true);
    }
  }

  // If selectedId is provided but we don't have the selected restaurant data yet,
  // show the selectedId indicator
  const showSelected = selected || selectedId;

  return (
    <div ref={containerRef} className="relative">
      {showSelected && selected ? (
        <div className="flex items-center gap-2 rounded-md border border-input bg-transparent px-3 py-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{selected.name}</p>
            {selected.address && (
              <p className="text-xs text-muted-foreground truncate">{selected.address}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Wyczyść wybór restauracji"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            placeholder="Szukaj restauracji po nazwie..."
            className="pl-9 pr-9"
            aria-label="Szukaj restauracji"
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            role="combobox"
            autoComplete="off"
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground animate-spin" />
          )}
        </div>
      )}

      {/* Dropdown */}
      {isOpen && !selected && (
        <div
          className="absolute z-50 mt-1 w-full rounded-md border border-input bg-popover shadow-md"
          role="listbox"
          aria-label="Wyniki wyszukiwania restauracji"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>Szukanie...</span>
            </div>
          ) : results.length === 0 && hasSearched ? (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
              Brak wyników
            </div>
          ) : (
            <ul className="max-h-60 overflow-y-auto py-1">
              {results.map((restaurant) => (
                <li key={restaurant.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(restaurant)}
                    className="w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                    role="option"
                    aria-selected={restaurant.id === selectedId}
                  >
                    <p className="text-sm font-medium">{restaurant.name}</p>
                    {restaurant.address && (
                      <p className="text-xs text-muted-foreground">{restaurant.address}</p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
