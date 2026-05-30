'use server';

import { geocodeAddress } from '@/services/geocoding';
import type { Coordinates } from '@/types/offers';

// ============================================================================
// Types
// ============================================================================

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

// ============================================================================
// Constants
// ============================================================================

const MAX_ADDRESS_LENGTH = 200;

// ============================================================================
// Server Actions
// ============================================================================

/**
 * Server action to geocode a restaurant address into geographic coordinates.
 * Validates address (non-empty, max 200 characters) before calling the geocoding service.
 *
 * Per requirement 6.5: when geocoding fails (no results, network error, timeout),
 * returns success with null data rather than an error — the offer should still be
 * stored without coordinates.
 *
 * Validates: Requirements 6.4, 6.5
 */
export async function geocodeAddressAction(
  address: string
): Promise<ActionResult<Coordinates | null>> {
  if (!address || address.trim().length === 0) {
    return { success: false, error: 'Adres jest wymagany.' };
  }

  if (address.trim().length > MAX_ADDRESS_LENGTH) {
    return {
      success: false,
      error: `Adres przekracza maksymalną długość ${MAX_ADDRESS_LENGTH} znaków.`,
    };
  }

  try {
    const coordinates = await geocodeAddress(address.trim());
    // Per requirement 6.5: geocoding failure returns success with null data
    // (the geocodeAddress service already returns null on failure)
    return { success: true, data: coordinates };
  } catch (error) {
    // Even unexpected errors should return success with null per requirement 6.5:
    // "IF the System cannot geocode a provided restaurant address, THEN THE System
    // SHALL store the Lunch_Offer without coordinates"
    console.error('geocodeAddressAction error:', error);
    return { success: true, data: null };
  }
}
