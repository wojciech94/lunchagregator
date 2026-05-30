"use client";

import { useState, useCallback, useEffect } from "react";
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
const STORAGE_KEY = "user_location";
const LOCATION_EVENT = "user-location-changed";
const DEFAULT_GEO_LABEL = "Bieżąca lokalizacja";

interface StoredLocation {
  coordinates: Coordinates;
  label: string;
  source: LocationSource;
  savedAt: number;
}

/** Read persisted location from localStorage (client-only). */
function readStoredLocation(): StoredLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLocation;
    if (
      parsed?.coordinates &&
      typeof parsed.coordinates.latitude === "number" &&
      typeof parsed.coordinates.longitude === "number"
    ) {
      return parsed;
    }
  } catch {
    // Ignore malformed storage
  }
  return null;
}

/** Persist location to localStorage and broadcast change to other hook instances. */
function writeStoredLocation(stored: StoredLocation | null) {
  if (typeof window === "undefined") return;
  try {
    if (stored === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    }
    // Notify other instances in the same tab
    window.dispatchEvent(new CustomEvent(LOCATION_EVENT, { detail: stored }));
  } catch {
    // Ignore quota / serialization errors
  }
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

  // Hydrate from localStorage on mount + subscribe to changes from other instances
  useEffect(() => {
    const stored = readStoredLocation();
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

    // Cross-instance (same tab) and cross-tab sync
    window.addEventListener(LOCATION_EVENT, handleLocationEvent);
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) {
        const next = readStoredLocation();
        handleLocationEvent(new CustomEvent(LOCATION_EVENT, { detail: next }));
      }
    });

    return () => {
      window.removeEventListener(LOCATION_EVENT, handleLocationEvent);
    };
  }, []);

  const setManualCoordinates = useCallback((coords: Coordinates, manualLabel?: string) => {
    const resolvedLabel = manualLabel?.trim() || "Własny adres";
    setCoordinates(coords);
    setLabel(resolvedLabel);
    setSource("manual");
    setError(null);
    writeStoredLocation({
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
    writeStoredLocation(null);
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
        writeStoredLocation({
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
