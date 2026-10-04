"use client";

import { useState, useCallback, useEffect } from "react";
import { clearUserLocationAction, saveUserLocationAction } from "@/actions/location";
import { useInitialLocation } from "@/components/location/LocationProvider";
import type { Coordinates } from "@/types/offers";

export type LocationSource = "geolocation" | "manual";

export interface UseGeolocationReturn {
  coordinates: Coordinates | null;
  label: string | null;
  source: LocationSource | null;
  error: string | null;
  loading: boolean;
  permissionState: "granted" | "denied" | "prompt" | null;
  requestLocation: () => void;
  setManualCoordinates: (coords: Coordinates, label?: string) => void;
  clearLocation: () => void;
}

const GEOLOCATION_TIMEOUT_MS = 10000;
const LOCATION_EVENT = "user-location-changed";
const DEFAULT_GEO_LABEL = "Bieżąca lokalizacja";

interface StoredLocation {
  coordinates: Coordinates;
  label: string;
  source: LocationSource;
  savedAt: number;
}

/** Notifies other hook instances in this tab. */
function broadcastLocation(stored: StoredLocation | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LOCATION_EVENT, { detail: stored }));
}

export function useGeolocation(): UseGeolocationReturn {
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [source, setSource] = useState<LocationSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [permissionState, setPermissionState] = useState<
    "granted" | "denied" | "prompt" | null
  >(null);

  // Seeded by the root layout from the httpOnly cookie. The cookie cannot be
  // read here, which is the point: it is not reachable from any script.
  const initialLocation = useInitialLocation();

  // Hydrate from localStorage on mount + subscribe to changes from other instances
  useEffect(() => {
    const stored = initialLocation;
    if (stored) {
      setCoordinates(stored.coordinates);
      setLabel(stored.label);
      setSource(stored.source);
    }

    function handleLocationEvent(e: Event) {
      const detail = (e as CustomEvent<StoredLocation | null>).detail;
      if (detail) {
        setCoordinates(detail.coordinates);
        setLabel(detail.label);
        setSource(detail.source);
        setError(null);
      } else {
        setCoordinates(null);
        setLabel(null);
        setSource(null);
      }
    }

    // Cross-instance sync within one tab. The cross-tab `storage` listener is
    // gone: the value now lives in an httpOnly cookie, which another tab
    // cannot read, so the server will seed it on that tab's next navigation.
    window.addEventListener(LOCATION_EVENT, handleLocationEvent);

    return () => {
      window.removeEventListener(LOCATION_EVENT, handleLocationEvent);
    };
  }, [initialLocation]);

  const setManualCoordinates = useCallback((coords: Coordinates, manualLabel?: string) => {
    const resolvedLabel = manualLabel?.trim() || "Własny adres";
    setCoordinates(coords);
    setLabel(resolvedLabel);
    setSource("manual");
    setError(null);
    void saveUserLocationAction(coords, resolvedLabel, "manual");
    broadcastLocation({
      coordinates: coords,
      label: resolvedLabel,
      source: "manual",
      savedAt: Date.now(),
    });
  }, []);

  const clearLocation = useCallback(() => {
    setCoordinates(null);
    setLabel(null);
    setSource(null);
    void clearUserLocationAction();
    broadcastLocation(null);
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError(
        "Geolokalizacja nie jest wspierana przez tę przeglądarkę. Wpisz adres ręcznie."
      );
      return;
    }

    setLoading(true);
    setError(null);

    // Query permission state if the API is available
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((result) => {
          setPermissionState(result.state as "granted" | "denied" | "prompt");
        })
        .catch(() => {
          // Permissions API not supported — leave state as null
        });
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setCoordinates(coords);
        setLabel(DEFAULT_GEO_LABEL);
        setSource("geolocation");
        setPermissionState("granted");
        setLoading(false);
        setError(null);
        void saveUserLocationAction(coords, DEFAULT_GEO_LABEL, "geolocation");
        broadcastLocation({
          coordinates: coords,
          label: DEFAULT_GEO_LABEL,
          source: "geolocation",
          savedAt: Date.now(),
        });
      },
      (geolocationError) => {
        setLoading(false);

        switch (geolocationError.code) {
          case geolocationError.PERMISSION_DENIED:
            setPermissionState("denied");
            setError(
              "Dostęp do lokalizacji został odrzucony. Wpisz adres ręcznie, aby zobaczyć oferty w pobliżu."
            );
            break;
          case geolocationError.POSITION_UNAVAILABLE:
            setError(
              "Nie udało się określić lokalizacji. Spróbuj ponownie lub wpisz adres ręcznie."
            );
            break;
          case geolocationError.TIMEOUT:
            setError(
              "Przekroczono czas oczekiwania na lokalizację. Spróbuj ponownie lub wpisz adres ręcznie."
            );
            break;
          default:
            setError(
              "Wystąpił nieznany błąd geolokalizacji. Wpisz adres ręcznie."
            );
            break;
        }
      },
      {
        enableHighAccuracy: false,
        timeout: GEOLOCATION_TIMEOUT_MS,
        maximumAge: 60000,
      }
    );
  }, []);

  return {
    coordinates,
    label,
    source,
    error,
    loading,
    permissionState,
    requestLocation,
    setManualCoordinates,
    clearLocation,
  };
}
