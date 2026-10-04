"use client";

import * as React from "react";
import { useGeolocation } from "@/hooks/useGeolocation";
import { getOffers } from "@/actions/offers";
import { AddressInput } from "@/components/location/AddressInput";
import { MapPin } from "lucide-react";
import { OfferFilters } from "./OfferFilters";
import { OfferList } from "./OfferList";
import { upcomingDays, todayISO } from "@/utils/day-of-week";
import { cn } from "@/lib/utils";
import type { OfferFilters as OfferFiltersType } from "@/types/filters";
import type { LunchOfferWithDistance, PaginatedOffers } from "@/types/offers";
import type { Coordinates } from "@/types/offers";

interface OffersPageProps {
  initialData: PaginatedOffers;
}

/**
 * Client wrapper component that wires together OfferFilters and OfferList.
 * Manages filter state, geolocation, sorting, and re-fetching offers.
 */
export function OffersPage({ initialData }: OffersPageProps) {
  const { coordinates, error: geoError, loading: geoLoading, permissionState, requestLocation, setManualCoordinates } =
    useGeolocation();

  const [offers, setOffers] = React.useState<LunchOfferWithDistance[]>(
    initialData.offers
  );
  const [pagination, setPagination] = React.useState({
    total: initialData.total,
    page: initialData.page,
    limit: initialData.limit,
    hasMore: initialData.hasMore,
  });
  const [filters, setFilters] = React.useState<OfferFiltersType>({});
  const [selectedDate, setSelectedDate] = React.useState<string>(todayISO());
  const [isLoading, setIsLoading] = React.useState(false);
  const [hasRequestedLocation, setHasRequestedLocation] = React.useState(false);

  const days = React.useMemo(() => upcomingDays(7), []);

  // Request geolocation on mount only if we don't already have a stored location
  React.useEffect(() => {
    if (hasRequestedLocation) return;
    setHasRequestedLocation(true);
    const t = setTimeout(() => {
      if (!coordinates) {
        requestLocation();
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRequestedLocation, requestLocation]);

  // Re-fetch offers when location becomes available (initial load with distance sort)
  React.useEffect(() => {
    if (coordinates) {
      fetchOffers({ ...filters, sortBy: filters.sortBy || "distance" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinates]);

  const fetchOffers = React.useCallback(
    async (currentFilters: OfferFiltersType, page?: number, dateOverride?: string) => {
      setIsLoading(true);
      try {
        const date = dateOverride ?? selectedDate;
        const filtersWithPage = { ...currentFilters, date, page: page ?? 1 };
        const result = await getOffers(filtersWithPage, coordinates ?? undefined);

        if (result.success) {
          // No sorting and no rewriting here.
          //
          // Ordering is the server's job, and it is now the only place it
          // happens: get_offers_filtered orders by distance when there is an
          // origin, by restaurant_name when there is not (Requirement 1.2), or by
          // whichever of price/newest was asked for. This component used to sort
          // again in JS, which meant three competing sorts -- Postgres, the
          // service, and this -- and the JS one ran over an already-sorted page,
          // so it could only ever rearrange a subset of what the server sent.
          //
          // distanceKm likewise comes back as a value or null, and OfferCard
          // already declines to render it when null. Absence of location is a
          // presentation state, not missing data; overwriting it here threw away
          // a real distance for an offer whose neighbour happened to have none.
          setOffers(result.data.offers);
          setPagination({
            total: result.data.total,
            page: result.data.page,
            limit: result.data.limit,
            hasMore: result.data.hasMore,
          });
        }
      } finally {
        setIsLoading(false);
      }
    },
    [coordinates, selectedDate]
  );

  const handleFiltersChange = React.useCallback(
    (newFilters: OfferFiltersType) => {
      setFilters(newFilters);
      fetchOffers(newFilters);
    },
    [fetchOffers]
  );

  const handleDayChange = React.useCallback(
    (date: string) => {
      setSelectedDate(date);
      fetchOffers(filters, 1, date);
    },
    [fetchOffers, filters]
  );

  const handlePageChange = React.useCallback(
    (page: number) => {
      fetchOffers(filters, page);
    },
    [fetchOffers, filters]
  );

  const handleManualLocation = React.useCallback(
    (coords: Coordinates) => {
      setManualCoordinates(coords);
    },
    [setManualCoordinates]
  );

  // No derived copy of the list. `displayOffers` used to exist only to blank
  // distanceKm when there was no location -- the same rewrite fetchOffers
  // already did, which is how the duplication started and how a third copy
  // would arrive. The server sends null for offers it could not place, and
  // OfferCard renders nothing for those.

  // Show address input when geolocation is denied/errored and we have no coordinates
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
                ? "Lokalizacja odrzucona. Wpisz adres, aby sortować oferty według odległości."
                : "Nie udało się pobrać lokalizacji. Wpisz adres ręcznie."}
            </p>
          </div>
          <AddressInput onLocationResolved={handleManualLocation} />
        </div>
      )}

      {/* Day selector - browse offers per day (useful for weekly menus).

          Seven 64px buttons plus gaps need 496px; a 320px viewport has 280px
          for this row. Horizontal scrolling left four of the seven days
          unreachable with no visual sign that more existed, which is what
          Requirement 7.1 now forbids. Wrapping fits all seven at every width
          and leaves the layout unchanged from 768px up. */}
      <div className="flex flex-wrap gap-2 pb-1">
        {days.map((d) => {
          const active = d.date === selectedDate;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => handleDayChange(d.date)}
              aria-pressed={active}
              className={cn(
                "flex shrink-0 flex-col items-center rounded-md border px-3 py-2 transition-colors min-w-[64px]",
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
              )}
            >
              <span className="text-base font-medium">{d.label}</span>
              <span className="text-base capitalize opacity-70">{d.weekday}</span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <OfferFilters
        onChange={handleFiltersChange}
        userLocation={coordinates}
        // Distance only once there is something to measure from. Without a
        // location the control stays unset, which is what makes the list
        // alphabetical by restaurant name -- Requirement 1.2 -- rather than the
        // newest-first list this used to ask for.
        initialFilters={coordinates ? { sortBy: "distance" } : {}}
      />

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" role="status" aria-label="Ładowanie ofert" />
        </div>
      )}

      {/* Single empty state — context-aware */}
      {!isLoading && offers.length === 0 && (
        <div className="rounded-lg border border-border bg-muted/50 p-6 text-center">
          <p className="text-muted-foreground">
            {Object.keys(filters).length > 0
              ? "Brak ofert spełniających wybrane kryteria. Spróbuj zmienić filtry."
              : "Brak ofert lunchowych na dziś. Sprawdź później lub dodaj własną ofertę!"}
          </p>
        </div>
      )}

      {/* Offer list */}
      {!isLoading && offers.length > 0 && (
        <OfferList
          offers={offers}
          pagination={pagination}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}
