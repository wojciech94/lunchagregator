"use client";

import * as React from "react";
import { MapPin, ChevronDown, Crosshair, X, Check } from "lucide-react";
import { useGeolocation } from "@/hooks/useGeolocation";
import { AddressInput } from "./AddressInput";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Coordinates } from "@/types/offers";

/**
 * Header widget showing the current user location with the ability to change it.
 * Reads/writes the shared location state (localStorage-backed) via useGeolocation,
 * so it stays in sync with the Offers and Restaurants pages.
 */
export function LocationIndicator() {
  const {
    coordinates,
    label,
    loading,
    requestLocation,
    setManualCoordinates,
    clearLocation,
  } = useGeolocation();

  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleManualLocation = React.useCallback(
    (coords: Coordinates, address?: string) => {
      setManualCoordinates(coords, address);
      setOpen(false);
    },
    [setManualCoordinates]
  );

  const handleUseGps = React.useCallback(() => {
    requestLocation();
  }, [requestLocation]);

  const handleClear = React.useCallback(() => {
    clearLocation();
    setOpen(false);
  }, [clearLocation]);

  const displayText = coordinates
    ? label ?? "Lokalizacja ustawiona"
    : "Ustaw lokalizację";

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-base transition-colors min-h-[44px] max-w-full xl:max-w-[200px]",
          coordinates
            ? "text-[#f7f8f8] hover:bg-white/5"
            : "text-[#62666d] hover:text-[#f7f8f8]"
        )}
      >
        <MapPin className={cn("size-4 shrink-0", coordinates && "text-primary")} />
        <span className="truncate">{displayText}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Ustawienia lokalizacji"
          className="relative xl:absolute right-0 z-50 mt-2 w-[300px] max-w-full rounded-md border border-border bg-popover p-4 shadow-[rgba(0,0,0,0.4)_0px_2px_8px_0px]"
        >
          {/* Current location status */}
          {coordinates ? (
            <div className="mb-3 flex items-start justify-between gap-2 rounded-[4px] border border-border bg-card px-3 py-2">
              <div className="flex items-start gap-2 min-w-0">
                <Check className="size-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Obecna lokalizacja</p>
                  <p className="text-sm text-foreground truncate" title={label ?? undefined}>
                    {label ?? "Ustawiona"}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={handleClear}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Wyczyść lokalizację"
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <p className="mb-3 text-sm text-muted-foreground">
              Ustaw lokalizację, aby sortować oferty i restauracje według odległości.
            </p>
          )}

          {/* Use GPS */}
          <Button
            type="button"
            onClick={handleUseGps}
            disabled={loading}
            className="w-full mb-3"
          >
            <Crosshair className="size-4" />
            {loading ? "Określanie..." : "Użyj mojej lokalizacji"}
          </Button>

          {/* Divider */}
          <div className="relative my-3">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-popover px-2 text-base text-muted-foreground">lub</span>
            </div>
          </div>

          {/* Manual address */}
          <AddressInput onLocationResolved={handleManualLocation} />
        </div>
      )}
    </div>
  );
}
