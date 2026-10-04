"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useGeolocation } from "@/hooks/useGeolocation";
import { AddressInput } from "@/components/location/AddressInput";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OfferFilters } from "./OfferFilters";
import { OfferList } from "./OfferList";
import { upcomingDays, todayISO } from "@/utils/day-of-week";
import { cn } from "@/lib/utils";
import {
  filtersToSearchParams,
  parseFiltersFromSearchParams,
} from "@/lib/filter-url";
import type { OfferFilters as OfferFiltersType } from "@/types/filters";
import type { LunchOfferWithDistance, PaginatedOffers } from "@/types/offers";
import type { Coordinates } from "@/types/offers";

interface OffersPageProps {
  initialData: PaginatedOffers;
}

/**
 * Client wrapper component that wires together OfferFilters and OfferList.
 *
 * The URL is the single source of truth for filters. Changing one navigates,
 * the server re-renders from the new query string, and `initialData` arrives
 * with the result -- so there is no filter state here and no client-side
 * refetch to keep in step with it.
 */
export function OffersPage({ initialData }: OffersPageProps) {
  const { coordinates, error: geoError, loading: geoLoading, permissionState, requestLocation, setManualCoordinates } =
    useGeolocation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  const { filters, radius } = React.useMemo(
    () => parseFiltersFromSearchParams(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );
  const selectedDate = filters.date ?? todayISO();

  // Rendered by the server from these props rather than mirrored into state.
  // Nothing to synchronise, and nothing that can disagree with the URL.
  const offers = initialData.offers;
  const pagination = {
    total: initialData.total,
    page: initialData.page,
    limit: initialData.limit,
    hasMore: initialData.hasMore,
  };
  const isLoading = isPending;

  const days = React.useMemo(() => upcomingDays(7), []);

  /**
   * One write path. `mode` is the whole difference between a filter the User
   * committed to and one they are still typing.
   *
   * `radius` is threaded separately because the URL carries it on its own --
   * the origin it needs is in the cookie, not the query string.
   */
  const writeUrl = React.useCallback(
    (next: OfferFiltersType, nextRadius: number | undefined, mode: "push" | "replace") => {
      const params = filtersToSearchParams(next);
      if (nextRadius !== undefined) {
        params.set("radius", String(nextRadius));
      }
      const query = params.toString();
      const url = query ? `${pathname}?${query}` : pathname;

      startTransition(() => {
        if (mode === "push") {
          router.push(url);
        } else {
          router.replace(url);
        }
      });
    },
    [pathname, router]
  );

  /** Requirement 2.11: any filter other than page returns to page 1. */
  const applyFilters = React.useCallback(
    (next: OfferFiltersType, nextRadius: number | undefined, mode: "push" | "replace") => {
      writeUrl({ ...next, page: 1 }, nextRadius, mode);
    },
    [writeUrl]
  );

  const handleFiltersChange = React.useCallback(
    (next: OfferFiltersType) =>
      applyFilters(next, next.distance?.radius ?? radius, "push"),
    [applyFilters, radius]
  );

  const handleSearchChange = React.useCallback(
    (next: OfferFiltersType) => applyFilters(next, radius, "replace"),
    [applyFilters, radius]
  );

  const handleDayChange = React.useCallback(
    (date: string) => applyFilters({ ...filters, date }, radius, "push"),
    [applyFilters, filters, radius]
  );

  const handlePageChange = React.useCallback(
    (page: number) => {
      writeUrl({ ...filters, page }, radius, "push");
    },
    [filters, radius, writeUrl]
  );

  const handleManualLocation = React.useCallback(
    (coords: Coordinates) => {
      setManualCoordinates(coords);
      // The cookie changed, so the server needs to render again with it --
      // that is what turns on distance filtering.
      router.refresh();
    },
    [setManualCoordinates, router]
  );

  // The location arrived after the first paint (the User granted permission).
  // The cookie was written server-side; refresh so the server can apply it.
  const previousCoordinates = React.useRef(coordinates);
  React.useEffect(() => {
    const had = previousCoordinates.current;
    previousCoordinates.current = coordinates;
    if (!had && coordinates) {
      router.refresh();
    }
  }, [coordinates, router]);

  React.useEffect(() => {
    if (permissionState === "denied" && !coordinates) {
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionState]);

  // No derived copy of the list, and no client-side refetch. Ordering and
  // distanceKm are the server's: get_offers_filtered orders by distance when
  // there is an origin, by restaurant_name when there is not (Requirement 1.2),
  // or by whichever of price/newest was asked for, and it returns distanceKm
  // as a value or null with OfferCard declining to render the null case. This
  // component used to sort again in JS, which meant three competing sorts --
  // Postgres, the service, and this -- and the JS one ran over an
  // already-sorted page, so it could only rearrange a subset of what the
  // server sent.

  // Show address input when geolocation is denied/errored and we have no coordinates
  const showAddressInput = !coordinates && (permissionState === "denied" || (!!geoError && !geoLoading));

  /**
   * The link asks for something that needs a location, and there is none.
   *
   * Requirement 2.12: the parameters stay in the URL and the page says so.
   * Stripping them would break the link for anyone it is re-shared to, and
   * `permissionState` has three values of which the server sees none -- so
   * stripping while the browser is still asking would throw the filters away
   * before the User could accept. This is the same shape as 7.1: saying
   * nothing while the promise goes unmet is worse than saying it plainly.
   */
  const distanceRequestedWithoutLocation =
    !coordinates &&
    !geoLoading &&
    (radius !== undefined || filters.sortBy === "distance");

  return (
    <div className="flex flex-col gap-6">
      {/* Geolocation loading */}
      {geoLoading && (
        <p className="text-sm text-muted-foreground animate-pulse">
          Określanie lokalizacji...
        </p>
      )}

      {distanceRequestedWithoutLocation && (
        <div
          className="rounded-md border border-border bg-card p-4 shadow-[0_1.2px_0_0_rgba(0,0,0,0.03)]"
          role="status"
          data-testid="distance-needs-location"
        >
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="size-4 text-primary" />
            <p className="text-sm text-muted-foreground">
              Ten link prosi o filtrowanie lub sortowanie według odległości, a nie
              znamy Twojej lokalizacji. Parametry zostały w adresie — podaj
              lokalizację, żeby zadziałały.
            </p>
          </div>
          {permissionState === "prompt" || permissionState === null ? (
            <Button variant="outline" onClick={requestLocation} disabled={geoLoading}>
              Ustal lokalizację
            </Button>
          ) : null}
          <AddressInput onLocationResolved={handleManualLocation} />
        </div>
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
        onSearchChange={handleSearchChange}
        userLocation={coordinates}
        // From the URL, not from what this component thinks. Passing a
        // sortBy derived from whether a location exists -- which is what this
        // did -- left the form showing a different filter set than the list it
        // was filtering, whenever the two disagreed, which a shared link
        // guarantees they do.
        initialFilters={{
          ...filters,
          ...(coordinates && !filters.sortBy ? { sortBy: "distance" as const } : {}),
          ...(radius !== undefined && coordinates
            ? { distance: { radius, from: coordinates } }
            : {}),
        }}
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
