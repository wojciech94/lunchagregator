'use server';

import { getOrCreateSessionToken, getSessionToken } from '@/lib/session';
import { offerFiltersSchema } from '@/lib/validations/filters';
import {
  listOffers,
  getOffer,
  getOffersByRestaurant,
  createOffer,
  updateOffer,
  deleteOffer,
  type ActionResult,
} from '@/services/offers';
import type { LunchOffer, PaginatedOffers, Coordinates } from '@/types/offers';
import type { OfferFilters } from '@/types/filters';

/**
 * Server action to get a paginated list of offers with optional filters.
 * Validates filters with Zod before passing to the service layer.
 * Passes user location if available for distance-based sorting.
 */
export async function getOffers(
  filters?: Partial<OfferFilters>,
  userLocation?: Coordinates
): Promise<ActionResult<PaginatedOffers>> {
  try {
    // Validate filters if provided
    const validatedFilters = filters
      ? offerFiltersSchema.safeParse(filters)
      : { success: true as const, data: {} as OfferFilters };

    if (!validatedFilters.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of validatedFilters.error.issues) {
        const path = issue.path.join('.');
        fieldErrors[path] = issue.message;
      }
      return {
        success: false,
        error: 'Invalid filter parameters',
        fieldErrors,
      };
    }

    const result = await listOffers(validatedFilters.data, userLocation);
    return { success: true, data: result };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch offers';
    return { success: false, error: message };
  }
}

/**
 * Server action to get a single offer by ID.
 */
export async function getOfferById(
  id: string
): Promise<ActionResult<LunchOffer>> {
  try {
    if (!id || typeof id !== 'string') {
      return { success: false, error: 'Invalid offer ID' };
    }

    return await getOffer(id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch offer';
    return { success: false, error: message };
  }
}

/**
 * Server action to get active offers associated with a restaurant.
 */
export async function getOffersByRestaurantAction(
  restaurantId: string
): Promise<ActionResult<LunchOffer[]>> {
  try {
    if (!restaurantId || typeof restaurantId !== 'string') {
      return { success: false, error: 'Invalid restaurant ID' };
    }

    const offers = await getOffersByRestaurant(restaurantId);
    return { success: true, data: offers };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch restaurant offers';
    return { success: false, error: message };
  }
}

/**
 * Server action to create a new offer.
 * Gets or creates a session token, then delegates to the service layer
 * which handles Zod validation and database insertion.
 */
export async function createOfferAction(
  data: unknown
): Promise<ActionResult<LunchOffer>> {
  try {
    const sessionToken = await getOrCreateSessionToken();
    return await createOffer(data, sessionToken);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create offer';
    return { success: false, error: message };
  }
}

/**
 * Server action to create multiple offers at once (e.g. a weekly menu where each
 * weekday has its own dish/date). Creates them sequentially under the same session
 * and returns a summary of successes and failures.
 */
export async function createOffersBatchAction(
  items: unknown[]
): Promise<ActionResult<{ created: LunchOffer[]; failed: { index: number; error: string }[] }>> {
  try {
    if (!Array.isArray(items) || items.length === 0) {
      return { success: false, error: 'Brak ofert do utworzenia.' };
    }

    const sessionToken = await getOrCreateSessionToken();

    const created: LunchOffer[] = [];
    const failed: { index: number; error: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      const result = await createOffer(items[i], sessionToken);
      if (result.success) {
        created.push(result.data);
      } else {
        failed.push({ index: i, error: result.error });
      }
    }

    // Treat as success if at least one offer was created
    if (created.length === 0) {
      return {
        success: false,
        error: failed[0]?.error ?? 'Nie udało się utworzyć żadnej oferty.',
      };
    }

    return { success: true, data: { created, failed } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create offers';
    return { success: false, error: message };
  }
}

/**
 * Server action to update an existing offer.
 * Gets the current session token and delegates to the service layer
 * which handles ownership check, Zod validation, and database update.
 */
export async function updateOfferAction(
  id: string,
  data: unknown
): Promise<ActionResult<LunchOffer>> {
  try {
    if (!id || typeof id !== 'string') {
      return { success: false, error: 'Invalid offer ID' };
    }

    const sessionToken = await getSessionToken();

    if (!sessionToken) {
      return {
        success: false,
        error: 'No session found. You must have a session to edit offers.',
      };
    }

    return await updateOffer(id, data, sessionToken);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to update offer';
    return { success: false, error: message };
  }
}

/**
 * Server action to delete an offer.
 * Gets the current session token and delegates to the service layer
 * which handles ownership check and database deletion.
 */
export async function deleteOfferAction(
  id: string
): Promise<ActionResult<void>> {
  try {
    if (!id || typeof id !== 'string') {
      return { success: false, error: 'Invalid offer ID' };
    }

    const sessionToken = await getSessionToken();

    if (!sessionToken) {
      return {
        success: false,
        error: 'No session found. You must have a session to delete offers.',
      };
    }

    return await deleteOffer(id, sessionToken);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to delete offer';
    return { success: false, error: message };
  }
}
