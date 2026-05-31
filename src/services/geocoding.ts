import { Coordinates } from '@/types/offers';

export interface GeocodingService {
  geocodeAddress(address: string): Promise<Coordinates | null>;
  calculateDistance(from: Coordinates, to: Coordinates): number;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';
const GEOCODING_TIMEOUT_MS = 10_000;

/**
 * Geocodes an address using the Nominatim/OpenStreetMap API.
 * Returns coordinates or null if geocoding fails (network error, timeout, no results).
 */
export async function geocodeAddress(address: string): Promise<Coordinates | null> {
  if (!address || address.trim().length === 0) {
    return null;
  }

  const url = new URL(NOMINATIM_BASE_URL);
  url.searchParams.set('q', address.trim());
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEOCODING_TIMEOUT_MS);

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'LunchAgregator/1.0',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const results: NominatimResult[] = await response.json();

    if (!results || results.length === 0) {
      return null;
    }

    const { lat, lon } = results[0];
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    if (isNaN(latitude) || isNaN(longitude)) {
      return null;
    }

    return { latitude, longitude };
  } catch {
    // Network errors, timeouts, JSON parse errors — all return null
    return null;
  }
}

/**
 * Calculates the straight-line distance between two geographic coordinates
 * using the Haversine formula.
 *
 * @returns Distance in kilometers, rounded to 1 decimal place.
 */
export function calculateDistance(from: Coordinates, to: Coordinates): number {
  const EARTH_RADIUS_KM = 6371;

  const lat1Rad = toRadians(from.latitude);
  const lat2Rad = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = EARTH_RADIUS_KM * c;

  return Math.round(distance * 10) / 10;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Default GeocodingService instance implementing the interface.
 */
export const geocodingService: GeocodingService = {
  geocodeAddress,
  calculateDistance,
};
