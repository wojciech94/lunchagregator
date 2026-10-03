'use server';

import { getUser } from '@/lib/auth';
import { checkOwnership } from '@/lib/ownership';
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
 * Requires an authenticated user; sets user_id from getUser() on the inserted record.
 * Requirements: 4.5, 5.2
 */
export async function createOfferAction(
  data: unknown
): Promise<ActionResult<LunchOffer>> {
  try {
    const user = await getUser();

    if (!user) {
      return { success: false, error: 'Brak autoryzacji' };
    }

    return await createOffer(data, user.id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create offer';
    return { success: false, error: message };
  }
}

/**
 * Server action to create multiple offers at once (e.g. a weekly menu where each
 * weekday has its own dish/date). Creates them sequentially under the same user
 * and returns a summary of successes and failures.
 * Requirements: 4.5, 5.2
 */
export async function createOffersBatchAction(
  items: unknown[]
): Promise<
  ActionResult<{
    created: LunchOffer[];
    failed: { index: number; error: string; fieldErrors?: Record<string, string> }[];
  }>
> {
  try {
    if (!Array.isArray(items) || items.length === 0) {
      return { success: false, error: 'Brak ofert do utworzenia.' };
    }

    const user = await getUser();

    if (!user) {
      return { success: false, error: 'Brak autoryzacji' };
    }

    const created: LunchOffer[] = [];
    const failed: {
      index: number;
      error: string;
      fieldErrors?: Record<string, string>;
    }[] = [];

    for (let i = 0; i < items.length; i++) {
      const result = await createOffer(items[i], user.id);
      if (result.success) {
        created.push(result.data);
      } else {
        failed.push({ index: i, error: result.error, fieldErrors: result.fieldErrors });
      }
    }

    // Treat as success if at least one offer was created
    if (created.length === 0) {
      // Every item failed for the same reason in the common case -- one bad
      // shared field, such as a missing restaurant name, fails all of them at
      // once. Surfacing the field errors of the first failure is what turns a
      // bare 'Validation failed' into something the User can act on.
      const firstFailure = failed[0];
      const fieldErrors = firstFailure?.fieldErrors;
      const firstMessage = fieldErrors
        ? Object.values(fieldErrors)[0]
        : undefined;

      return {
        success: false,
        error:
          firstMessage ??
          firstFailure?.error ??
          'Nie udało się utworzyć żadnej oferty.',
        ...(fieldErrors ? { fieldErrors } : {}),
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
 * Requires an authenticated user; verifies ownership via user_id before updating.
 * Requirements: 4.5, 5.3, 5.4, 5.5
 */
export async function updateOfferAction(
  id: string,
  data: unknown
): Promise<ActionResult<LunchOffer>> {
  try {
    if (!id || typeof id !== 'string') {
      return { success: false, error: 'Invalid offer ID' };
    }

    const user = await getUser();

    if (!user) {
      return { success: false, error: 'Brak autoryzacji' };
    }

    // Fetch the existing offer to check ownership
    const existing = await getOffer(id);
    if (!existing.success) {
      return existing;
    }

    const recordUserId = existing.data.userId ?? null;

    if (!checkOwnership(user.id, recordUserId)) {
      return { success: false, error: 'Brak uprawnień do tej operacji' };
    }

    return await updateOffer(id, data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to update offer';
    return { success: false, error: message };
  }
}

/**
 * Server action to delete an offer.
 * Requires an authenticated user; verifies ownership via user_id before deleting.
 * Requirements: 4.5, 5.3, 5.4, 5.5
 */
export async function deleteOfferAction(
  id: string
): Promise<ActionResult<void>> {
  try {
    if (!id || typeof id !== 'string') {
      return { success: false, error: 'Invalid offer ID' };
    }

    const user = await getUser();

    if (!user) {
      return { success: false, error: 'Brak autoryzacji' };
    }

    // Fetch the existing offer to check ownership
    const existing = await getOffer(id);
    if (!existing.success) {
      return existing;
    }

    const recordUserId = existing.data.userId ?? null;

    if (!checkOwnership(user.id, recordUserId)) {
      return { success: false, error: 'Brak uprawnień do tej operacji' };
    }

    return await deleteOffer(id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to delete offer';
    return { success: false, error: message };
  }
}
