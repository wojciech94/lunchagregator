import { cookies } from 'next/headers';
import type { Coordinates } from '@/types/offers';

/**
 * Server-side reader for the stored location.
 *
 * Coordinates live in a cookie rather than in the URL, because a query string
 * reaches browser history, server logs, analytics and the `Referer` header on
 * every outbound click, and location is personal data. See Requirement 2.9.
 *
 * The cookie is `httpOnly`, so no client can read it -- which is an improvement
 * over the `localStorage` it replaces, readable by any script on the page. The
 * cost is that the value has to be handed down from the server, which is what
 * `LocationProvider` in the root layout is for.
 */
export const LOCATION_COOKIE_NAME = 'lunchagregator_location';

/** 30 days, matching the Supabase session default. */
export const LOCATION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export type LocationSource = 'geolocation' | 'manual';

export interface StoredLocation {
  coordinates: Coordinates;
  label: string;
  source: LocationSource;
  savedAt: number;
}

function isCoordinates(value: unknown): value is Coordinates {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { latitude?: unknown; longitude?: unknown };
  return (
    typeof candidate.latitude === 'number' &&
    typeof candidate.longitude === 'number' &&
    Number.isFinite(candidate.latitude) &&
    Number.isFinite(candidate.longitude)
  );
}

/** Narrow an unknown parsed value, so a malformed cookie cannot break a render. */
export function parseStoredLocation(raw: string | undefined | null): StoredLocation | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredLocation>;
    if (!isCoordinates(parsed?.coordinates)) return null;
    return {
      coordinates: parsed.coordinates,
      label: typeof parsed.label === 'string' ? parsed.label : 'Bieżąca lokalizacja',
      source: parsed.source === 'manual' ? 'manual' : 'geolocation',
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    };
  } catch {
    // A corrupt cookie is treated as no location rather than failing the render.
    return null;
  }
}

export function serialiseStoredLocation(stored: StoredLocation): string {
  return JSON.stringify(stored);
}

/** Reads the cookie on the server. Returns null when unset or malformed. */
export async function readStoredLocationCookie(): Promise<StoredLocation | null> {
  const cookieStore = await cookies();
  return parseStoredLocation(cookieStore.get(LOCATION_COOKIE_NAME)?.value);
}