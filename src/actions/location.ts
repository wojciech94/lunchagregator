'use server';

import { cookies } from 'next/headers';
import {
  LOCATION_COOKIE_MAX_AGE,
  LOCATION_COOKIE_NAME,
  serialiseStoredLocation,
  type LocationSource,
  type StoredLocation,
} from '@/lib/location';
import type { Coordinates } from '@/types/offers';

function isCoordinates(value: unknown): value is Coordinates {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { latitude?: unknown; longitude?: unknown };
  return (
    typeof candidate.latitude === 'number' &&
    typeof candidate.longitude === 'number' &&
    Number.isFinite(candidate.latitude) &&
    Number.isFinite(candidate.longitude) &&
    Math.abs(candidate.latitude) <= 90 &&
    Math.abs(candidate.longitude) <= 180
  );
}

/**
 * Persists the User's location so the server can read it.
 *
 * The browser resolves geolocation on the client, so writing the cookie costs
 * one server round trip. That is the price of an `httpOnly` cookie, and it is
 * worth paying: with the location in `localStorage` the server cannot see it at
 * all, which is why the first paint could never apply distance filtering.
 */
export async function saveUserLocationAction(
  coordinates: unknown,
  label: string | undefined,
  source: LocationSource | undefined
): Promise<{ success: boolean }> {
  if (!isCoordinates(coordinates)) {
    return { success: false };
  }

  const stored: StoredLocation = {
    coordinates: { latitude: coordinates.latitude, longitude: coordinates.longitude },
    label: label?.trim() || 'Bieżąca lokalizacja',
    source: source === 'manual' ? 'manual' : 'geolocation',
    savedAt: Date.now(),
  };

  const cookieStore = await cookies();
  cookieStore.set(LOCATION_COOKIE_NAME, serialiseStoredLocation(stored), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: LOCATION_COOKIE_MAX_AGE,
    path: '/',
  });

  return { success: true };
}

/** Forgets the stored location. */
export async function clearUserLocationAction(): Promise<{ success: boolean }> {
  const cookieStore = await cookies();
  cookieStore.set(LOCATION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  });
  return { success: true };
}