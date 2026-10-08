'use server';

import { MAX_OFFERS_PER_BATCH, OFFER_BATCH_LIMIT_MESSAGE } from '@/lib/validations/offer-batch';

import { getAdmin, getUser } from '@/lib/auth';
import { canDelete, canModify, isAdmin } from '@/lib/ownership';
import { recordAudit, shouldAudit } from '@/lib/audit';
import { createClient } from '@/lib/supabase/server';
import { offerFiltersSchema } from '@/lib/validations/filters';
import {
  listOffers,
  listOrphanOffers,
  getOffer,
  getOffersByRestaurant,
  createOffer,
  updateOffer,
  deleteOffer,
  renewRestaurantMenu,
  assignOffersToRestaurant,
  type ActionResult,
  type ActionResultWithLocationWarning,
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
 * Server action returning an offer together with what the caller may do to it.
 *
 * Exists because the edit and delete pages are client components and cannot ask.
 * `getUser()` lives in `@/lib/auth`, which imports `next/headers` and therefore
 * refuses to compile outside a server component -- an earlier attempt to import it
 * into those pages failed the production build. The permission has to arrive over
 * a server action, which is the only channel a client component has to the
 * session.
 *
 * One round trip rather than two: the pages need the offer to render and the
 * answer to decide whether to render the form, and asking separately would fetch
 * the same row twice.
 *
 * `false` rather than an error when the caller may not act. "This does not exist"
 * and "you may not touch this" are different answers -- merging them would tell a
 * prober that a given id is real -- and the pages already render the refusal.
 *
 * This does not replace the checks in `updateOfferAction` and `deleteOfferAction`.
 * Those remain the only thing standing between a request and a mutation; this
 * tells the reader what to expect, one step earlier.
 */
export async function getOfferWithAccessAction(
  id: string
): Promise<ActionResult<{ offer: LunchOffer; canModify: boolean; canDelete: boolean }>> {
  try {
    if (!id || typeof id !== 'string') {
      return { success: false, error: 'Invalid offer ID' };
    }

    const existing = await getOffer(id);
    if (!existing.success) {
      return existing;
    }

    const user = await getUser();
    const recordUserId = existing.data.userId ?? null;

    return {
      success: true,
      data: {
        offer: existing.data,
        canModify: canModify(user, recordUserId),
        canDelete: canDelete(user, recordUserId),
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch offer';
    return { success: false, error: message };
  }
}

/**
 * Server action listing offers that have no owner, for the admin panel. #55.
 *
 * The admin check is here as well as in the database, because the two layers fail
 * differently. `get_orphan_offers` returns zero rows to a non-admin rather than an
 * error, so a caller that reached it without a role would render "nothing to
 * reclaim" over a table full of orphans -- a page that is confidently wrong, which
 * is worse than one that refuses.
 *
 * No filters. The panel's job is to show what needs attention, and every filter
 * added here is a way for a stale record to look like somebody else's problem.
 */
export async function getOrphanOffersAction(): Promise<ActionResult<LunchOffer[]>> {
  try {
    const adminUser = await getAdmin();

    if (!adminUser) {
      return { success: false, error: 'Brak uprawnień' };
    }

    return { success: true, data: await listOrphanOffers() };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch orphan offers';
    return { success: false, error: message };
  }
}

/**
 * Server action to get a single offer by ID.
 */
export async function getOfferById(
  id: string
): Promise<ActionResult<LunchOffer>> {  try {
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
 *
 * `locationWarning` is passed through so the caller can tell the User that
 * distance sorting will not include the offer, per Requirement 6.5. It is set
 * when an address was supplied and could not be geocoded, and the offer was
 * still saved.
 *
 * Requirements: 4.5, 5.2, 6.5
 */
export async function createOfferAction(
  data: unknown
): Promise<ActionResultWithLocationWarning<LunchOffer>> {
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
    /**
     * How many of the created offers have no coordinates, per Requirement 6.5.
     * A weekly menu shares one address, so this is usually every offer or none
     * -- which is why it is a count rather than a per-offer flag.
     */
    missingCoordinates: number;
  }>
> {
  try {
    if (!Array.isArray(items) || items.length === 0) {
      return { success: false, error: 'Brak ofert do utworzenia.' };
    }

    if (items.length > MAX_OFFERS_PER_BATCH) {
      return { success: false, error: OFFER_BATCH_LIMIT_MESSAGE };
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

    // Counted from the saved rows rather than the create results: a geocoding
    // failure is silent by design, and the stored row is what distance queries
    // will filter on.
    const missingCoordinates = created.filter(
      (offer) => !offer.restaurantLocation,
    ).length;

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

    return { success: true, data: { created, failed, missingCoordinates } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create offers';
    return { success: false, error: message };
  }
}

/**
 * Server action to renew a restaurant's current menu week one week ahead
 * (Req 8.5–8.6, #71). Owner or admin; the summary reports created, skipped,
 * failed and the offers saved without coordinates.
 */
export async function renewMenuAction(
  restaurantId: string
): Promise<
  ActionResult<{
    created: number;
    skipped: number;
    failed: number;
    missingCoordinates: number;
  }>
> {
  try {
    if (!restaurantId || typeof restaurantId !== 'string') {
      return { success: false, error: 'Invalid restaurant ID' };
    }

    const user = await getUser();

    if (!user) {
      return { success: false, error: 'Brak autoryzacji' };
    }

    // Ownership gate, the same two layers as everywhere else: the RLS
    // policies scope the reads and writes, and this check refuses before any
    // query runs for a restaurant the User does not own.
    const supabase = await createClient();
    const { data: row } = await supabase
      .from('restaurants')
      .select('user_id')
      .eq('id', restaurantId)
      .single();

    if (!row || !canModify(user, (row as { user_id: string | null }).user_id)) {
      return { success: false, error: 'Brak uprawnień do tej operacji' };
    }

    return await renewRestaurantMenu(restaurantId, user.id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to renew the menu';
    return { success: false, error: message };
  }
}

/**
 * Server action to attach the User's own unlinked offers to a restaurant
 * (Req 8.9 as amended by #74). Attach-when-null only: already-linked offers
 * are skipped and reported, never re-linked, never detached. The restaurant
 * must be one the User can modify.
 */
export async function assignOfferRestaurantAction(
  offerIds: string[],
  restaurantId: string
): Promise<ActionResult<{ attached: number; skippedAlreadyLinked: number }>> {
  try {
    if (
      !Array.isArray(offerIds) ||
      offerIds.length === 0 ||
      offerIds.length > 50 ||
      offerIds.some((id) => typeof id !== 'string' || id.length === 0)
    ) {
      return { success: false, error: 'Invalid offer IDs' };
    }

    if (!restaurantId || typeof restaurantId !== 'string') {
      return { success: false, error: 'Invalid restaurant ID' };
    }

    const user = await getUser();

    if (!user) {
      return { success: false, error: 'Brak autoryzacji' };
    }

    // Two-layer gate, as everywhere: the RLS policies scope the reads and
    // writes, and this check refuses before any query runs for a restaurant
    // the User does not own.
    const supabase = await createClient();
    const { data: row } = await supabase
      .from('restaurants')
      .select('user_id')
      .eq('id', restaurantId)
      .single();

    if (!row || !canModify(user, (row as { user_id: string | null }).user_id)) {
      return { success: false, error: 'Brak uprawnień do tej operacji' };
    }

    return await assignOffersToRestaurant(offerIds, restaurantId, user.id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to assign the offers';
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

    // The user object, not just its id: an admin is recognised by app_metadata,
    // and passing `user.id` here would reduce every caller to owner-or-nobody.
    const actorIsAdmin = isAdmin(user);
    if (!canModify(user, recordUserId)) {
      return { success: false, error: 'Brak uprawnień do tej operacji' };
    }

    const result = await updateOffer(id, data);

    // Logged only on success, and only for an admin. An ordinary owner editing
    // their own record is already constrained by RLS and checkOwnership; the log
    // exists for the admin who is not the owner.
    if (result.success && shouldAudit(actorIsAdmin)) {
      const supabase = await createClient();
      await recordAudit(supabase, user.id, {
        action: 'update',
        tableName: 'lunch_offers',
        recordId: id,
        // The record as the application read it, not the raw snake_case row.
        // restaurantLocation is a Coordinates here and null when the address was
        // never geocoded, which is more readable for an operator than WKB hex and
        // no less complete.
        before: existing.data as unknown as Record<string, unknown>,
        after: result.data as unknown as Record<string, unknown>,
      });
    }

    return result;
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

    const actorIsAdmin = isAdmin(user);
    if (!canDelete(user, recordUserId)) {
      return { success: false, error: 'Brak uprawnień do tej operacji' };
    }

    const result = await deleteOffer(id);

    if (result.success && shouldAudit(actorIsAdmin)) {
      const supabase = await createClient();
      // `before` carries the whole record, which is the point: the row is gone
      // after this, so the log is the only remaining copy of what was deleted.
      await recordAudit(supabase, user.id, {
        action: 'delete',
        tableName: 'lunch_offers',
        recordId: id,
        before: existing.data as unknown as Record<string, unknown>,
        after: null,
      });
    }

    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to delete offer';
    return { success: false, error: message };
  }
}
