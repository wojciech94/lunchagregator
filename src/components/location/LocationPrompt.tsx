"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useGeolocation } from "@/hooks/useGeolocation";
import { AddressInput } from "./AddressInput";
import type { Coordinates } from "@/types/offers";

const STORAGE_KEY = "location_prompt_dismissed";

interface LocationPromptProps {
  onLocationResolved: (coordinates: Coordinates) => void;
}

export function LocationPrompt({ onLocationResolved }: LocationPromptProps) {
  const [dismissed, setDismissed] = useState(true); // default hidden to avoid flash
  const [showAddressInput, setShowAddressInput] = useState(false);

  const { coordinates, error, loading, permissionState, requestLocation } =
    useGeolocation();

  // Check localStorage on mount to determine if prompt should show
  useEffect(() => {
    const wasDismissed = localStorage.getItem(STORAGE_KEY);
    setDismissed(wasDismissed === "true");
  }, []);

  // When geolocation succeeds, resolve and dismiss
  useEffect(() => {
    if (coordinates) {
      localStorage.setItem(STORAGE_KEY, "true");
      setDismissed(true);
      onLocationResolved(coordinates);
    }
  }, [coordinates, onLocationResolved]);

  // When permission is denied, show address input
  useEffect(() => {
    if (permissionState === "denied") {
      setShowAddressInput(true);
    }
  }, [permissionState]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  }, []);

  const handleAddressResolved = useCallback(
    (coords: Coordinates) => {
      localStorage.setItem(STORAGE_KEY, "true");
      setDismissed(true);
      onLocationResolved(coords);
    },
    [onLocationResolved]
  );

  // Don't render if already dismissed
  if (dismissed) return null;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-base">
          📍 Sortowanie ofert według odległości
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!showAddressInput && (
          <>
            <p className="text-sm text-muted-foreground">
              Udostępnij swoją lokalizację, aby zobaczyć oferty lunchowe
              posortowane od najbliższych.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={requestLocation}
                disabled={loading}
                size="default"
              >
                {loading ? "Określanie lokalizacji..." : "Udostępnij lokalizację"}
              </Button>
              <Button
                onClick={handleDismiss}
                variant="ghost"
                size="default"
                disabled={loading}
              >
                Nie teraz
              </Button>
            </div>
            {error && !showAddressInput && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
                {permissionState !== "denied" && (
                  <Button
                    onClick={requestLocation}
                    variant="outline"
                    size="sm"
                  >
                    Spróbuj ponownie
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        {showAddressInput && (
          <AddressInput onLocationResolved={handleAddressResolved} />
        )}
      </CardContent>
    </Card>
  );
}
