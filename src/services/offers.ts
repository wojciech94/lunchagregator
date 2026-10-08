import { createClient } from '@/lib/supabase/server';
import { parsePostGisPoint } from '@/lib/postgis';
import { geocodeAddress } from '@/services/geocoding';
import {
  addDaysISO,
  anchorIsTooOld,
  computeRenewalPlan,
  renewalAnchor,
  type RenewalInputOffer,
} from '@/lib/offer-renewal';
import {
  createOfferSchema,
  cuisineTypeSchema,
  updateOfferSchema,
  type CreateOfferInput,
  type UpdateOfferInput,
} from '@/lib/validations/offer';
import type { OfferFilters } from '@/types/filters';
import type {
  Coordinates,
  LunchOffer,
  LunchOfferWithDistance,
  PaginatedOffers,
} from '@/types/offers';

// ActionResult pattern for error handling
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

/**
 * A create result that can also report a successful-but-incomplete save.
 *
 * Requirement 6.5: when an address is supplied and cannot be geocoded, the
 * offer is stored without coordinates *and* the User is told that distance
 * sorting will not include it. That is not a failure, so it cannot ride on
 * `success: false` -- and without a field of its own it would be indistinguishable
 * from a save that lost nothing.
 */
export type ActionResultWithLocationWarning<T> =
  | ({ success: true; data: T } & {
      /**
       * True when an address was given but no coordinates could be resolved,
       * so the offer was saved without them. Absent or false otherwise.
       */
      locationWarning?: true;
    })
  | { success: false; error: string; fieldErrors?: Record<string, string> };

// Database row type (snake_case)
interface DbLunchOffer {
  id: string;
  dish_name: string;
  items: string[];
  price: number;
  currency: string;
  description: string | null;
  restaurant_id: string | null;
  restaurant_name: string;
  restaurant_address: string | null;
  restaurant_location: string | null;
  available_date: string;
  cuisine_type: string | null;
  dietary_tags: string[];
  allergens: string[];
  source_type: string;
  user_id: string | null;
  session_token: string;
  created_at: string;
  updated_at: string;
}

/**
 * Maps a database row (snake_case) to a LunchOffer (camelCase).
 */
function mapDbRowToOffer(row: DbLunchOffer): LunchOffer {
  return {
    id: row.id,
    dishName: row.dish_name,
    items: (row.items as string[]) ?? [],
    price: Number(row.price),
    currency: row.currency,
    description: row.description,
    restaurantId: row.restaurant_id ?? undefined,
    restaurantName: row.restaurant_name,
    restaurantAddress: row.restaurant_address,
    restaurantLocation: parseLocation(row.restaurant_location),
    availableDate: row.available_date,
    cuisineType: row.cuisine_type as LunchOffer['cuisineType'],
    dietaryTags: row.dietary_tags as LunchOffer['dietaryTags'],
    allergens: row.allergens as LunchOffer['allergens'],
    sourceType: row.source_type as LunchOffer['sourceType'],
    userId: row.user_id ?? null,
    sessionToken: row.session_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Parses a PostGIS point into Coordinates or null.
 *
 * Delegates to parsePostGisPoint because the format depends on how the value
 * was fetched: PostgREST returns WKB hex for a geography column, while a
 * projected column or an RPC may return GeoJSON, and a raw value from a test
 * fixture is often WKT. This used to handle only GeoJSON and WKT, so a
 * coordinate stored by the database parsed as null.
 */
function parseLocation(
  location: unknown
): LunchOffer['restaurantLocation'] {
  const point = parsePostGisPoint(location);
  if (!point) return null;
  return { latitude: point.latitude, longitude: point.longitude };
}

/**
 * Formats coordinates as the PostGIS text form PostgREST accepts for insert.
 * Longitude first, matching `POINT(lon lat)` as written in restaurants.ts.
 */
function pointString(coordinates: Coordinates): string {
  return `POINT(${coordinates.longitude} ${coordinates.latitude})`;
}

/**
 * Maps camelCase CreateOfferInput to snake_case DB insert object.
 */
function mapOfferToDbRow(
  data: CreateOfferInput,
  userId: string
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    dish_name: data.dishName,
    items: data.items ?? [],
    price: data.price,
    restaurant_name: data.restaurantName,
    available_date: data.availableDate,
    source_type: data.sourceType,
    user_id: userId,
    description: data.description ?? null,
    cuisine_type: data.cuisineType ?? null,
    dietary_tags: data.dietaryTags ?? [],
    allergens: data.allergens ?? [],
    restaurant_address: data.restaurantAddress ?? null,
  };

  // Only include restaurant_id if it has a value (column may not exist if migration hasn't run)
  if (data.restaurantId) {
    row.restaurant_id = data.restaurantId;
  }

  return row;
}

/**
 * Maps camelCase UpdateOfferInput to snake_case DB update object.
 * Only includes fields that are defined.
 */
function mapUpdateToDbRow(data: UpdateOfferInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};

  if (data.dishName !== undefined) row.dish_name = data.dishName;
  if (data.items !== undefined) row.items = data.items;
  if (data.price !== undefined) row.price = data.price;
  if (data.restaurantName !== undefined)
    row.restaurant_name = data.restaurantName;
  if (data.availableDate !== undefined) row.available_date = data.availableDate;
  if (data.sourceType !== undefined) row.source_type = data.sourceType;
  if (data.description !== undefined) row.description = data.description;
  if (data.cuisineType !== undefined) row.cuisine_type = data.cuisineType;
  if (data.dietaryTags !== undefined) row.dietary_tags = data.dietaryTags;
  if (data.allergens !== undefined) row.allergens = data.allergens;
  if (data.restaurantAddress !== undefined)
    row.restaurant_address = data.restaurantAddress;

  // restaurant_id is deliberately absent. It is not part of UpdateOfferInput,
  // so an update cannot touch the link: an offer does not detach from a
  // restaurant. The field used to be here, guarded by `!== undefined`, which
  // made a `null` from the client a silent no-op. RestaurantForm sets it only
  // on create, and restaurant-management owns that relationship.

  row.updated_at = new Date().toISOString();

  return row;
}

/**
 * Get a single offer by ID.
 */
export async function getOffer(
  id: string
): Promise<ActionResult<LunchOffer>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('lunch_offers')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return { success: false, error: 'Offer not found' };
    }
    return { success: false, error: 'Failed to fetch offer' };
  }

  return { success: true, data: mapDbRowToOffer(data as DbLunchOffer) };
}

/**
 * Fetches active lunch offers (available_date >= today) associated with a restaurant
 * by its FK. Used on the restaurant detail page. Sorted by availability date ascending.
 */
export async function getOffersByRestaurant(
  restaurantId: string
): Promise<LunchOffer[]> {
  const supabase = await createClient();
  const today = getTodayDate();

  const { data, error } = await supabase
    .from('lunch_offers')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .gte('available_date', today)
    .order('available_date', { ascending: true })
    .limit(50);

  if (error || !data) {
    return [];
  }

  return (data as DbLunchOffer[]).map(mapDbRowToOffer);
}

/**
 * Create a new offer with Zod validation.
 * Sets user_id from the authenticated user on the inserted record.
 *
 * Coordinates are resolved before the INSERT, not after. `get_offers_filtered`
 * applies a radius only to rows that have them, so an offer inserted without
 * coordinates is invisible to every distance query for the rest of its life --
 * the post-insert geocode that used to live in the client discarded its result,
 * which left every AI-added offer permanently without coordinates.
 *
 * Precedence, most trustworthy first:
 *   1. the linked restaurant's own location, which is already verified
 *   2. geocoding the address
 *   3. nothing, per Requirement 6.5 -- the offer is still saved
 *
 * **Snapshot authority (Req 8.3).** When the offer is linked to a restaurant,
 * the name and address snapshot comes from the restaurant's row, not from the
 * client payload -- the form's values are prefills, never authority. The same
 * resolved address feeds the geocode fallback, so a restaurant that has an
 * address but no coordinates still gets placed from it.
 *
 * When (3) happens and an address was supplied, `locationWarning` is returned so
 * the caller can tell the User that distance sorting will not include this
 * offer. Requirement 6.5 asks for exactly that message, and the server is the
 * only layer that knows which branch was taken.
 */
export async function createOffer(
  data: unknown,
  userId: string,
  options?: { presetLocation?: string | null; inferCuisine?: boolean }
): Promise<ActionResultWithLocationWarning<LunchOffer>> {
  // Validate input with Zod
  const parsed = createOfferSchema.safeParse(data);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      fieldErrors[path] = issue.message;
    }
    return {
      success: false,
      error: 'Validation failed',
      fieldErrors,
    };
  }

  if (!userId) {
    return { success: false, error: 'User ID is required' };
  }

  const supabase = await createClient();
  const dbRow = mapOfferToDbRow(parsed.data, userId);

  // The snapshot's authority: the linked restaurant's own row. The client's
  // name/address values are prefills, not authority (Req 8.3) — a bound offer
  // snapshots what the restaurant says, so a stray client value cannot make an
  // offer disagree with the entity it claims to belong to.
  let snapshotName = parsed.data.restaurantName;
  let snapshotAddress = parsed.data.restaurantAddress ?? null;

  // 1. The linked restaurant already has coordinates: reuse them rather than
  // paying Nominatim again for an address we have already resolved.
  if (parsed.data.restaurantId) {
    const { data: restaurant, error: restaurantError } = await supabase
      .from('restaurants')
      .select('location, name, address, cuisine_types')
      .eq('id', parsed.data.restaurantId)
      .single();

    if (restaurantError || !restaurant) {
      return { success: false, error: 'Nie znaleziono restauracji' };
    }

    if (restaurant.location) {
      dbRow.restaurant_location = restaurant.location;
    }
    snapshotName = restaurant.name;
    // Null is authoritative too: a coordinate-only branch must not acquire
    // a stale client address. Existing published snapshots are never changed.
    snapshotAddress = restaurant.address ?? null;

    // Dish cuisine wins. A single valid restaurant cuisine is an unambiguous
    // publication default; multiple cuisines do not identify this dish.
    // Renewal disables inference to preserve source dish fields verbatim,
    // including unknown cuisine, while still taking the current place.
    if (options?.inferCuisine !== false && parsed.data.cuisineType == null && restaurant.cuisine_types?.length === 1) {
      const cuisine = cuisineTypeSchema.safeParse(restaurant.cuisine_types[0]);
      if (cuisine.success) dbRow.cuisine_type = cuisine.data;
    }
  }

  dbRow.restaurant_name = snapshotName;
  dbRow.restaurant_address = snapshotAddress;

  // Whether an address was asked to be resolved. Tracked separately from
  // `restaurant_location` so the warning below can distinguish "no address, so
  // none was expected" from "an address was given and we could not place it".
  // Computed from the resolved snapshot, not the raw payload: a restaurant
  // that carries its own address still gets placed even when the client sent
  // none. A coordinate-only entity keeps a null address.
  const addressRequested =
    typeof snapshotAddress === 'string' && snapshotAddress.trim().length > 0;

  // 2. Otherwise geocode, once, on the server, before the row exists. Only
  // when an address is present and we have no coordinates yet.
  //
  // A preset place (Req 8.5) short-circuits this: the renewal has already
  // resolved the coordinates from the restaurant's current row, and renewal
  // never geocodes -- a null preset means "no coordinates", not "ask
  // Nominatim".
  if (options?.presetLocation !== undefined) {
    if (options.presetLocation !== null) {
      dbRow.restaurant_location = options.presetLocation;
    }
  } else if (!dbRow.restaurant_location && addressRequested) {
    try {
      const coordinates = await geocodeAddress(snapshotAddress!);
      if (coordinates) {
        dbRow.restaurant_location = pointString(coordinates);
      }
    } catch (error) {
      // geocodeAddress returns null for network errors and timeouts, but a
      // throw here would lose the whole offer over a geocoding outage.
      // Requirement 6.5: the offer is saved either way.
      console.error('Offer geocoding failed:', error);
    }
  }

  const { data: inserted, error } = await supabase
    .from('lunch_offers')
    .insert(dbRow)
    .select('*')
    .single();

  if (error) {
    return { success: false, error: `Failed to create offer: ${error.message}` };
  }

  const offer = mapDbRowToOffer(inserted as DbLunchOffer);

  // Requirement 6.5: an address was supplied and no coordinates came out, so
  // tell the caller this offer will be absent from distance sorting. Reading
  // the saved row rather than the local decision means the flag describes what
  // is actually stored, not what this function hoped to store.
  if (addressRequested && !offer.restaurantLocation) {
    return { success: true, data: offer, locationWarning: true };
  }

  return { success: true, data: offer };
}

/**
 * Every offer in the table, newest first, mapped -- the operator's queue
 * (#76). Deliberately NOT the public listing: that answers "what can I eat,
 * near me, today", which left the admin panel showing a single today-row.
 * The admin needs rows from every date and the exact count behind the cap.
 *
 * Returns mapped rows (camelCase) -- the panel renders `OrphanOfferRow`,
 * which speaks `LunchOffer`, not database columns. The cap is enforced here
 * as well as in the caller, same as `listOrphanOffers`.
 */
export async function listAllOffersForAdmin(
  limit = 200
): Promise<{ offers: LunchOffer[]; total: number }> {
  const capped = Math.min(limit, 200);

  const supabase = await createClient();

  const { data, error, count } = await supabase
    .from('lunch_offers')
    .select('*', { count: 'exact' })
    .order('available_date', { ascending: false })
    .limit(capped);

  if (error) {
    throw new Error(`Failed to fetch offers: ${error.message}`);
  }

  const offers = ((data ?? []) as unknown as DbLunchOffer[]).map(mapDbRowToOffer);
  return { offers, total: count ?? offers.length };
}

/**
 * Req 8.5–8.6 (#71): re-create the restaurant's current menu week one week
 * ahead, in one click.
 *
 * The plan (`computeRenewalPlan`) picks the anchor week, maps every dish to
 * `available_date + 7`, and dedupes against the User's own upcoming rows.
 * This function owns the rest of the contract:
 *
 * - **The place comes from the restaurant's current row** -- name, address
 *   and coordinates. Renewal passes them to `createOffer` as a preset, so a
 *   restaurant that moved publishes its new address and one whose
 *   coordinates were never resolved stays unplaced but counted.
 * - **Renewal never geocodes** -- the preset short-circuits Nominatim
 *   entirely (Req 8.5).
 * - **A single failed create does not sink the batch** (the
 *   `createOffersBatchAction` precedent): it is counted and reported, like
 *   the skips.
 */
export async function renewRestaurantMenu(
  restaurantId: string,
  userId: string
): Promise<
  ActionResult<{
    created: number;
    skipped: number;
    failed: number;
    missingCoordinates: number;
  }>
> {
  const supabase = await createClient();

  const { data: restaurant, error: restaurantError } = await supabase
    .from('restaurants')
    .select('id, name, address, location')
    .eq('id', restaurantId)
    .single();

  if (restaurantError || !restaurant) {
    return { success: false, error: 'Nie znaleziono restauracji' };
  }

  const today = getTodayDate();

  // One fetch serves the anchor, the sources and the dedupe set: the User's
  // own offers for this restaurant, newest first. Renewal never needs older
  // history -- anything beyond the anchor week is archive.
  const { data: rows, error: offersError } = await supabase
    .from('lunch_offers')
    .select(
      'id, dish_name, available_date, price, description, items, dietary_tags, allergens, source_type, cuisine_type'
    )
    .eq('restaurant_id', restaurantId)
    .eq('user_id', userId)
    .gte('available_date', addDaysISO(today, -30))
    .order('available_date', { ascending: false })
    .limit(200);

  if (offersError) {
    return {
      success: false,
      error: `Nie udało się pobrać ofert: ${offersError.message}`,
    };
  }

  const offerRows = rows ?? [];

  if (offerRows.length === 0) {
    return { success: false, error: 'Brak ofert tej restauracji do wznowienia.' };
  }

  const anchor = renewalAnchor(offerRows.map((row) => row.available_date as string))!;

  if (anchorIsTooOld(anchor, today)) {
    return {
      success: false,
      error:
        'Menu jest starsze niż tydzień — dodaj je ponownie przez „Dodaj ofertę”.',
    };
  }

  const plan = computeRenewalPlan(
    offerRows.map(
      (row): RenewalInputOffer => ({
        id: row.id,
        dishName: row.dish_name as string,
        availableDate: row.available_date as string,
      })
    ),
    today
  );

  if (plan.toCreate.length === 0) {
    return {
      success: false,
      error: 'Nie ma czego wznowić — wszystkie dania nowego tygodnia już istnieją.',
    };
  }

  const rowsById = new Map(offerRows.map((row) => [row.id, row]));

  let created = 0;
  let failed = 0;
  let missingCoordinates = 0;

  for (const item of plan.toCreate) {
    const source = rowsById.get(item.offer.id);
    if (!source) {
      failed += 1;
      continue;
    }

    const result = await createOffer(
      {
        dishName: source.dish_name as string,
        price: source.price as number,
        restaurantName: restaurant.name as string,
        restaurantAddress: (restaurant.address as string | null) ?? undefined,
        availableDate: item.targetDate,
        sourceType: source.source_type as CreateOfferInput['sourceType'],
        cuisineType: (source.cuisine_type as CreateOfferInput['cuisineType']) ?? null,
        description: (source.description as string | null) ?? undefined,
        items: (source.items as string[]) ?? [],
        dietaryTags: (source.dietary_tags as string[]) ?? [],
        allergens: (source.allergens as string[]) ?? [],
        restaurantId,
      },
      userId,
      { presetLocation: (restaurant.location as string | null) ?? null, inferCuisine: false }
    );

    if (result.success) {
      created += 1;
      if (!result.data.restaurantLocation) {
        missingCoordinates += 1;
      }
    } else {
      failed += 1;
    }
  }

  return {
    success: true,
    data: {
      created,
      skipped: plan.skipped.length,
      failed,
      missingCoordinates,
    },
  };
}

/**
 * Req 8.9 as amended by #74: attach the User's own name-only offers to a
 * restaurant.
 *
 * The narrow exception to #18's "no post-hoc attach", granted when the legacy
 * bucket turned out to be a real backlog rather than an archive:
 *
 * - **attach-when-null only.** An offer with a restaurant is skipped, never
 *   re-linked; nothing is ever detached. #18's rule -- an offer does not
 *   change or drop its restaurant -- survives intact.
 * - **The snapshot is not rewritten.** Req 6.2 keeps the offer's own name and
 *   address as the display truth; the link is for traceability and renewal.
 * - Ownership is enforced twice: the offers must belong to the caller, and
 *   the restaurant must be one they can modify (checked by the action).
 */
export async function assignOffersToRestaurant(
  offerIds: string[],
  restaurantId: string,
  userId: string
): Promise<ActionResult<{ attached: number; skippedAlreadyLinked: number }>> {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from('lunch_offers')
    .select('id, restaurant_id')
    .in('id', offerIds)
    .eq('user_id', userId);

  if (error) {
    return {
      success: false,
      error: `Nie udało się pobrać ofert: ${error.message}`,
    };
  }

  const owned = (rows ?? []) as { id: string; restaurant_id: string | null }[];
  const attachable = owned
    .filter((row) => row.restaurant_id === null)
    .map((row) => row.id);
  const skippedAlreadyLinked = owned.length - attachable.length;

  if (attachable.length === 0) {
    return { success: true, data: { attached: 0, skippedAlreadyLinked } };
  }

  const { error: updateError } = await supabase
    .from('lunch_offers')
    .update({ restaurant_id: restaurantId })
    .in('id', attachable);

  if (updateError) {
    return {
      success: false,
      error: `Nie udało się przypisać ofert: ${updateError.message}`,
    };
  }

  return {
    success: true,
    data: { attached: attachable.length, skippedAlreadyLinked },
  };
}

/**
 * Update an existing offer.
 * Ownership must be verified by the caller (action layer) before calling this function.
 */
export async function updateOffer(
  id: string,
  data: unknown
): Promise<ActionResultWithLocationWarning<LunchOffer>> {
  const supabase = await createClient();

  // Validate input with Zod
  const parsed = updateOfferSchema.safeParse(data);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      fieldErrors[path] = issue.message;
    }
    return {
      success: false,
      error: 'Validation failed',
      fieldErrors,
    };
  }

  const dbRow = mapUpdateToDbRow(parsed.data);

  let addressRequested = false;
  if (parsed.data.restaurantAddress !== undefined || parsed.data.useRestaurantLocation) {
    const { data: existing, error } = await supabase
      .from('lunch_offers')
      .select('restaurant_id, restaurant_address, restaurant_location')
      .eq('id', id)
      .single();
    if (error || !existing) {
      return { success: false, error: 'Nie znaleziono oferty' };
    }

    let address = parsed.data.restaurantAddress?.trim() || null;
    const addressChanged = address !== (existing.restaurant_address?.trim() || null);
    const needsLocation = parsed.data.useRestaurantLocation || addressChanged || !parseLocation(existing.restaurant_location);

    if (needsLocation) {
      let restaurant: { address: string | null; location: unknown } | null = null;
      if (existing.restaurant_id) {
        const result = await supabase.from('restaurants')
          .select('address, location').eq('id', existing.restaurant_id).single();
        if (!result.error) restaurant = result.data;
      }
      if (parsed.data.useRestaurantLocation) {
        if (!restaurant) return { success: false, error: 'Nie znaleziono przypisanej restauracji' };
        address = restaurant.address?.trim() || null;
      }

      dbRow.restaurant_address = address;
      // Never retain coordinates belonging to the previous address.
      dbRow.restaurant_location = null;
      addressRequested = address !== null;
      const restaurantPoint = parseLocation(restaurant?.location);
      // Only reuse a restaurant's coordinates for the same address, or when
      // explicitly restoring its place (including coordinate-only restaurants).
      if (restaurantPoint && (parsed.data.useRestaurantLocation ||
        (address !== null && address === restaurant?.address?.trim()))) {
        dbRow.restaurant_location = pointString(restaurantPoint);
      } else if (address) {
        try {
          const coordinates = await geocodeAddress(address);
          if (coordinates) dbRow.restaurant_location = pointString(coordinates);
        } catch {
          // A geocoding outage must not discard an otherwise valid edit.
          // The successful save reports its missing location below.
        }
      }
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('lunch_offers')
    .update(dbRow)
    .eq('id', id)
    .select('*')
    .single();

  if (updateError) {
    return {
      success: false,
      error: `Failed to update offer: ${updateError.message}`,
    };
  }

  const offer = mapDbRowToOffer(updated as DbLunchOffer);
  return addressRequested && !offer.restaurantLocation
    ? { success: true, data: offer, locationWarning: true }
    : { success: true, data: offer };
}

/**
 * Delete an offer.
 * Ownership must be verified by the caller (action layer) before calling this function.
 */
export async function deleteOffer(
  id: string
): Promise<ActionResult<void>> {
  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from('lunch_offers')
    .delete()
    .eq('id', id);

  if (deleteError) {
    return {
      success: false,
      error: `Failed to delete offer: ${deleteError.message}`,
    };
  }

  return { success: true, data: undefined };
}

// ============================================================================
// Offer Listing and Filtering
// ============================================================================

/**
 * Maps a raw database row to a LunchOfferWithDistance object.
 */
function mapDbRowToOfferWithDistance(
  row: Record<string, unknown>,
  distanceKm: number | null
): LunchOfferWithDistance {
  // Same decoder as parseLocation. This branch previously tried JSON.parse on
  // whatever string arrived, which for a WKB hex string threw, and then fell
  // back to a WKT regex that could never match -- so it returned null for
  // every real row.
  const restaurantLocation = parseLocation(row.restaurant_location);

  return {
    id: row.id as string,
    dishName: row.dish_name as string,
    items: (row.items as string[]) ?? [],
    price: Number(row.price),
    currency: row.currency as string,
    description: (row.description as string) ?? null,
    restaurantName: row.restaurant_name as string,
    restaurantAddress: (row.restaurant_address as string) ?? null,
    restaurantLocation,
    availableDate: row.available_date as string,
    cuisineType: (row.cuisine_type as LunchOfferWithDistance['cuisineType']) ?? null,
    dietaryTags: (row.dietary_tags as LunchOfferWithDistance['dietaryTags']) ?? [],
    allergens: (row.allergens as LunchOfferWithDistance['allergens']) ?? [],
    sourceType: row.source_type as LunchOfferWithDistance['sourceType'],
    userId: (row.user_id as string) ?? null,
    sessionToken: row.session_token as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    distanceKm,
  };
}

/**
 * Returns today's date in YYYY-MM-DD format.
 *
 * UTC on purpose: every date this service compares against the database --
 * whose `CURRENT_DATE` is also UTC -- must use the same calendar, or the
 * offer-listing boundary drifts by a day around midnight. The *local*
 * calendar (`todayISO()` in day-of-week.ts) is the form-default convention
 * and stays there.
 */
export function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/** The full row `get_offers_filtered` returns, plus the computed distance. */
interface FilteredOfferRow extends DbLunchOffer {
  distance_km: number | null;
}

/**
 * Counts the rows the same filters would match, unpaged.
 *
 * The function slices in SQL, so `hasMore` cannot come from the returned page.
 * This is one extra count rather than an unbounded fetch of every id: the old
 * code got its total from the second query's `count: 'exact'` only because it
 * was already fetching the rows, and it fetched all of them.
 */
async function countFilteredOffers(
  filters: OfferFilters,
  location: Coordinates | null,
  date: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<number> {
  let query = supabase
    .from('lunch_offers')
    .select('*', { count: 'exact', head: true })
    .eq('available_date', date);

  if (location && filters.distance) {
    // PostgREST cannot express ST_DWithin, so the radius count has to ask the
    // function for a full page and count what comes back. The alternative is a
    // second RPC that only counts, which is more code for the same answer.
    const { data, error } = await supabase.rpc('get_offers_filtered', {
      p_date: date,
      p_price_min: filters.price?.min ?? null,
      p_price_max: filters.price?.max ?? null,
      p_cuisine_types: filters.cuisineTypes ?? null,
      p_dietary_tags: filters.dietaryTags ?? null,
      p_search_query: filters.searchQuery ?? null,
      p_user_lat: location.latitude,
      p_user_lng: location.longitude,
      p_radius_km: filters.distance.radius,
      p_sort_by: filters.sortBy ?? 'distance',
      // The slider caps at 25 km, so 500 km reaches every offer on earth that
      // has coordinates.
      p_limit: 500,
      p_offset: 0,
    });
    if (error) throw new Error(`Failed to count offers: ${error.message}`);
    return (data ?? []).length;
  }

  if (filters.price) {
    query = query.gte('price', filters.price.min).lte('price', filters.price.max);
  }
  if (filters.cuisineTypes && filters.cuisineTypes.length > 0) {
    query = query.in('cuisine_type', filters.cuisineTypes);
  }
  for (const tag of filters.dietaryTags ?? []) {
    query = query.contains('dietary_tags', [tag]);
  }
  if (filters.searchQuery && filters.searchQuery.length >= 2) {
    const pattern = `%${filters.searchQuery}%`;
    query = query.or(
      `dish_name.ilike.${pattern},description.ilike.${pattern}`,
    );
  }

  const { count, error } = await query;
  if (error) throw new Error(`Failed to count offers: ${error.message}`);
  return count ?? 0;
}

/**
 * Lists lunch offers with filtering, sorting, and pagination.
 *
 * One RPC, `get_offers_filtered` (#19). It replaces three query shapes: a plain
 * Supabase select, a distance RPC that returned six columns, and a second
 * unbounded query to fetch the rows the first one did not return. Filtering,
 * ordering and slicing all happen in one statement now.
 *
 * Behaviour, unchanged from what the three paths did together:
 * - Defaults to today; `filters.date` selects another day. The old distance
 *   function hardcoded CURRENT_DATE, so asking for another day returned zero
 *   rows rather than that day's offers.
 * - Max 50 per page, Requirement 1.1.
 * - With a location and `sortBy: 'distance'`, nearest first.
 * - Without a location, alphabetical by restaurant name, Requirement 1.2 --
 *   which is also the fallback for any explicit sort with no location to
 *   measure from.
 * - Price: min <= price <= max. Cuisine: OR within the list. Dietary: AND
 *   across tags. Search: ILIKE over dish name and description. Combined: AND.
 */
export async function listOffers(
  filters: OfferFilters,
  userLocation?: Coordinates
): Promise<PaginatedOffers> {
  const date = filters.date ?? getTodayDate();
  const page = filters.page ?? 1;
  const limit = Math.min(filters.limit ?? 50, 50);
  const offset = (page - 1) * limit;

  // A radius needs an origin. `filters.distance.from` is the one the User chose;
  // the browser's position is the fallback, matching the old dispatch at :451.
  const origin = filters.distance?.from ?? null;
  const location = origin ?? (userLocation ?? null);

  // A radius only applies when there is an origin to measure from. Sent without
  // one the function ignores it rather than matching nothing, so first paint --
  // which has the slider's radius and no location yet -- still lists offers.
  const radius = location ? (filters.distance?.radius ?? null) : null;

  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_offers_filtered', {
    p_date: date,
    p_price_min: filters.price?.min ?? null,
    p_price_max: filters.price?.max ?? null,
    p_cuisine_types: filters.cuisineTypes ?? null,
    p_dietary_tags: filters.dietaryTags ?? null,
    p_search_query: filters.searchQuery ?? null,
    p_user_lat: location?.latitude ?? null,
    p_user_lng: location?.longitude ?? null,
    p_radius_km: radius,
    p_sort_by: filters.sortBy ?? 'distance',
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    throw new Error(`Failed to fetch offers: ${error.message}`);
  }

  const offers: LunchOfferWithDistance[] = (
    (data ?? []) as unknown as FilteredOfferRow[]
  ).map((row) =>
    mapDbRowToOfferWithDistance(row as unknown as Record<string, unknown>, row.distance_km),
  );

  const total = await countFilteredOffers(filters, location, date, supabase);

  return {
    offers,
    total,
    page,
    limit,
    hasMore: offset + offers.length < total,
  };
}

/**
 * How many orphans one call returns at most.
 *
 * Named rather than repeated, because the SQL default, the SQL GREATEST fallback
 * and this cap are three places that have to agree -- and the one that matters is
 * the smallest of them.
 */
const ORPHAN_OFFER_LIMIT = 200;

/**
 * Lists offers that have no owner, for the admin panel. #55.
 *
 * One RPC, `get_orphan_offers` (20250101000008), which filters `user_id IS NULL`
 * and ignores `available_date` -- the panel is a cleanup queue rather than a menu,
 * and a record whose date has already passed is exactly what is worth finding.
 *
 * Not a variant of `listOffers` and deliberately not folded into it. That function
 * answers "what can I eat, near me, on this day" and every one of its parameters
 * is about answering that question well; this one answers a different question,
 * has no filters to share with it, and returns a different shape -- a flat list
 * with no page, because there is no cursor to advance.
 *
 * `distanceKm` is null on every row. There is no origin here, and the alternative
 * -- a distance from the operator, or from nowhere -- would be a number on screen
 * that means nothing. The panel shows the restaurant address instead.
 *
 * The cap is enforced here as well as in SQL. A caller passing 100000 gets 200,
 * which is the same answer either way but for one reason rather than two.
 */
export async function listOrphanOffers(limit?: number): Promise<LunchOfferWithDistance[]> {
  const capped = Math.min(limit ?? ORPHAN_OFFER_LIMIT, ORPHAN_OFFER_LIMIT);

  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_orphan_offers', { p_limit: capped });

  if (error) {
    throw new Error(`Failed to fetch orphan offers: ${error.message}`);
  }

  return ((data ?? []) as unknown as FilteredOfferRow[]).map((row) =>
    // distance_km is absent from this function's return rather than null, and
    // the mapper takes the distance as an argument precisely so the two list
    // queries can share it.
    mapDbRowToOfferWithDistance(row as unknown as Record<string, unknown>, null)
  );
}
