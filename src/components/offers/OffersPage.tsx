"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useGeolocation } from "@/hooks/useGeolocation";
import { LocationIndicator } from "@/components/location/LocationIndicator";
import { AddressInput } from "@/components/location/AddressInput";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { OfferFilters } from "./OfferFilters";
import { OfferList } from "./OfferList";
import { menuDates, menuToday, nextMenuMonday } from '@/lib/recurring-menu';
import { priceFilterSchema } from "@/lib/validations/filters";
import {
  filtersToSearchParams,
  parseFiltersFromSearchParams,
} from "@/lib/filter-url";
import type { OfferFilters as OfferFiltersType } from "@/types/filters";
import type { PaginatedOffers } from "@/types/offers";
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
  const selectedDate = filters.date ?? menuToday();

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

  const today = menuToday();
  const [windowStart, setWindowStart] = React.useState(() =>
    selectedDate >= menuDates(today, 8)[7] || selectedDate < today ? selectedDate : today);
  React.useEffect(() => {
    setWindowStart(current => selectedDate < current || selectedDate > menuDates(current, 7)[6] ? selectedDate : current);
  }, [selectedDate]);
  const days = menuDates(windowStart, 7).map(date => ({ date,
    label: date === today ? 'Dziś' : new Date(`${date}T12:00:00Z`).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    weekday: new Date(`${date}T12:00:00Z`).toLocaleDateString('pl-PL', { weekday: 'short', timeZone: 'UTC' }),
  }));
  const fullDate = new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const hasBrowsingCriteria = !!(filters.price || filters.cuisineTypes?.length || filters.dietaryTags?.length || filters.searchQuery || radius !== undefined);

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
    (next: OfferFiltersType, options?: { clearRadius?: boolean }) =>
      applyFilters({ date: filters.date, ...next }, options?.clearRadius ? undefined : next.distance?.radius ?? radius, "push"),
    [applyFilters, filters.date, radius]
  );

  const handleSearchChange = React.useCallback(
    (next: OfferFiltersType) => applyFilters({ date: filters.date, ...next }, radius, "replace"),
    [applyFilters, filters.date, radius]
  );

  // Reset browsing criteria, not the day being browsed. Removing radius and
  // explicit sort restores the server's location-aware default ordering.
  const handleReset = React.useCallback(
    () => applyFilters({ date: filters.date }, undefined, "push"),
    [applyFilters, filters.date]
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
        <p className="text-sm text-muted-foreground" role="status">
          Określanie lokalizacji...
        </p>
      )}

      {distanceRequestedWithoutLocation && (
        <Alert
          role="status"
          data-testid="distance-needs-location"
        >
          <MapPin aria-hidden="true" />
          <AlertTitle>Podaj lokalizację</AlertTitle>
          <AlertDescription>
            <p>
              Ten link prosi o filtrowanie lub sortowanie według odległości, a nie
              znamy Twojej lokalizacji. Parametry zostały w adresie — podaj
              lokalizację, żeby zadziałały.
            </p>
          {permissionState === "prompt" || permissionState === null ? (
            <Button variant="outline" onClick={requestLocation} disabled={geoLoading}>
              Ustal lokalizację
            </Button>
          ) : null}
          <AddressInput onLocationResolved={handleManualLocation} />
          </AlertDescription>
        </Alert>
      )}

      {/* Manual address input fallback */}
      {showAddressInput && !distanceRequestedWithoutLocation && (
        <Alert>
          <MapPin aria-hidden="true" />
          <AlertTitle>Wpisz adres ręcznie</AlertTitle>
          <AlertDescription>
            <p>
              {permissionState === "denied"
                ? "Lokalizacja odrzucona. Wpisz adres, aby sortować oferty według odległości."
                : "Nie udało się pobrać lokalizacji. Wpisz adres ręcznie."}
            </p>
          <AddressInput onLocationResolved={handleManualLocation} />
          </AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-4" aria-label="Wybór daty lunchu">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <LocationIndicator />
          <div className="flex flex-wrap gap-2">
            {windowStart !== today && <Button variant="ghost" onClick={() => { setWindowStart(today); handleDayChange(today); }}>Wróć do dziś</Button>}
            <Button variant="outline" onClick={() => { const next = nextMenuMonday(windowStart); setWindowStart(next); handleDayChange(next); }}>Następny tydzień</Button>
          </div>
        </div>
        <ToggleGroup type="single" value={selectedDate} variant="outline" spacing={2}
          className="grid w-full grid-cols-3 min-[400px]:grid-cols-4 md:grid-cols-7"
          aria-label="Dzień lunchu" onValueChange={date => { if (date) handleDayChange(date); }}>
          {days.map(d => <ToggleGroupItem key={d.date} value={d.date} className="h-auto flex-col gap-1 py-3"
            aria-label={`${d.label}, ${d.weekday}`}>
            <span className="text-sm capitalize">{d.weekday}</span>
            <span className="text-base font-semibold">{d.label}</span>
          </ToggleGroupItem>)}
        </ToggleGroup>
      </section>
      {/* Filters */}
      <OfferFilters
        onChange={handleFiltersChange}
        onSearchChange={handleSearchChange}
        onReset={handleReset}
        initialRadius={radius}
        userLocation={coordinates}
        // From the URL, not from what this component thinks. Passing a
        // sortBy derived from whether a location exists -- which is what this
        // did -- left the form showing a different filter set than the list it
        // was filtering, whenever the two disagreed, which a shared link
        // guarantees they do.
        initialFilters={{
          ...filters,
          ...(radius !== undefined && coordinates
            ? { distance: { radius, from: coordinates } }
            : {}),
        }}
      />

      {/* Keep the current results in place while the server renders the next
          query. Replacing the list with a spinner collapsed its layout. */}
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">{pagination.total} ofert · {fullDate}</p>
      <div className="relative min-h-24" data-testid="offer-results" aria-busy={isLoading}>
        {isLoading && (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-background/60 pt-8">
            <Spinner aria-label="Ładowanie ofert" />
          </div>
        )}

        {/* Single empty state — context-aware */}
        {offers.length === 0 && (
          <Empty className="border border-solid bg-card">
            <EmptyHeader>
            <EmptyTitle>Nie znaleźliśmy takiego lunchu</EmptyTitle>
            <EmptyDescription>
              {filters.price && !priceFilterSchema.safeParse(filters.price).success
                ? "Popraw zakres cen, aby wyświetlić oferty."
                : hasBrowsingCriteria
                ? "Brak ofert spełniających wybrane kryteria. Spróbuj zmienić filtry."
                : `Brak ofert lunchowych na ${fullDate}. Sprawdź inny dzień lub dodaj własną ofertę.`}
            </EmptyDescription>
            </EmptyHeader>
            {hasBrowsingCriteria && <EmptyContent><Button variant="outline" onClick={handleReset}>Wyczyść kryteria wyszukiwania</Button></EmptyContent>}
          </Empty>
        )}

        {/* Offer list */}
        {offers.length > 0 && (
          <OfferList
            offers={offers}
            pagination={pagination}
            onPageChange={handlePageChange}
          />
        )}
      </div>
    </div>
  );
}
