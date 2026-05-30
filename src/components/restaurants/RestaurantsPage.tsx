"use client";

import * as React from "react";
import { MapPin } from "lucide-react";
import { useGeolocation } from "@/hooks/useGeolocation";
import { listRestaurants } from "@/actions/restaurants";
import { AddressInput } from "@/components/location/AddressInput";
import { RestaurantFilters } from "./RestaurantFilters";
import { RestaurantList } from "./RestaurantList";
import type { RestaurantFilters as RestaurantFiltersType, PaginatedRestaurants } from "@/types/restaurants";
import type { Coordinates } from "@/types/offers";

interface RestaurantsPageProps {
  initialData: PaginatedRestaurants;
}

/**
 * Client wrapper component that wires together RestaurantFilters and RestaurantList.
 * Manages filter state, geolocation, pagination, and re-fetching restaurants.
 */
export function RestaurantsPage({ initialData }: RestaurantsPageProps) {
  const { coordinates, error: geoError, loading: geoLoading, permissionState, requestLocation, setManualCoordinates } =
    useGeolocation();

  const [data, setData] = React.useState<PaginatedRestaurants>(initialData);
  const [filters, setFilters] = React.useState<RestaurantFiltersType>({});
  const [isLoading, setIsLoading] = React.useState(false);
  const [hasRequestedLocation, setHasRequestedLocation] = React.useState(false);

  // Request geolocation on mount only if we don't already have a stored location
  React.useEffect(() => {
    if (hasRequestedLocation) return;
    setHasRequestedLocation(true);
    // Defer one tick so the hook can hydrate from localStorage first
    const t = setTimeout(() => {
      if (!coordinates) {
        requestLocation();
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRequestedLocation, requestLocation]);

  // Re-fetch when location becomes available
  React.useEffect(() => {
    if (coordinates) {
      fetchRestaurants(filters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinates]);

  const fetchRestaurants = React.useCallback(
    async (currentFilters: RestaurantFiltersType, page?: number) => {
      setIsLoading(true);
      try {
        const filtersWithPage: RestaurantFiltersType = {
          ...currentFilters,
          page: page ?? 1,
        };

        if (coordinates && currentFilters.distance) {
          filtersWithPage.distance = {
            ...currentFilters.distance,
            from: coordinates,
          };
        }

        const result = await listRestaurants(filtersWithPage);
        setData(result);
      } finally {
        setIsLoading(false);
      }
    },
    [coordinates]
  );

  const handleFiltersChange = React.useCallback(
    (newFilters: RestaurantFiltersType) => {
      setFilters(newFilters);
      fetchRestaurants(newFilters);
    },
    [fetchRestaurants]
  );

  const handlePageChange = React.useCallback(
    (page: number) => {
      fetchRestaurants(filters, page);
    },
    [fetchRestaurants, filters]
  );

  const handleManualLocation = React.useCallback(
    (coords: Coordinates) => {
      setManualCoordinates(coords);
    },
    [setManualCoordinates]
  );

  const hasActiveFilters =
    (filters.searchQuery && filters.searchQuery.length >= 2) ||
    (filters.priceLevels && filters.priceLevels.length > 0) ||
    (filters.cuisineTypes && filters.cuisineTypes.length > 0) ||
    !!filters.lunchTimeAt ||
    !!filters.distance;

  // Show address input when geolocation is denied/errored and we have no coordinates at all
  const showAddressInput = !coordinates && (permissionState === "denied" || (!!geoError && !geoLoading));

  return (
    <div className="flex flex-col gap-6">
      {/* Geolocation loading */}
      {geoLoading && (
        <p className="text-sm text-muted-foreground animate-pulse">
          Określanie lokalizacji...
        </p>
      )}

      {/* Manual address input fallback */}
      {showAddressInput && (
        <div className="rounded-md border border-border bg-card p-4 shadow-[0_1.2px_0_0_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="size-4 text-primary" />
            <p className="text-sm text-muted-foreground">
              {permissionState === "denied"
                ? "Lokalizacja odrzucona. Wpisz adres lub ustaw lokalizację w nagłówku."
                : "Nie udało się pobrać lokalizacji. Wpisz adres ręcznie."}
            </p>
          </div>
          <AddressInput onLocationResolved={handleManualLocation} />
        </div>
      )}

      {/* Filters */}
      <RestaurantFilters
        filters={filters}
        onChange={handleFiltersChange}
        userLocation={coordinates ?? undefined}
      />

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <div
            className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"
            role="status"
            aria-label="Ładowanie restauracji"
          />
        </div>
      )}

      {/* Restaurant list */}
      {!isLoading && (
        <RestaurantList
          data={data}
          hasActiveFilters={!!hasActiveFilters}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}
