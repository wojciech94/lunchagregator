import { createClient } from '@/lib/supabase/server';
import { parsePostGisPoint } from '@/lib/postgis';
import { geocodeAddress } from '@/services/geocoding';
import {
  createOfferSchema,
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
 * Coordinates are resolved before the INSERT, not after. `get_offers_within_radius`
 * filters `WHERE restaurant_location IS NOT NULL`, so an offer inserted without
 * them is invisible to every distance query for the rest of its life -- the
 * post-insert geocode that used to live in the client discarded its result,
 * which left every AI-added offer permanently without coordinates.
 *
 * Precedence, most trustworthy first:
 *   1. the linked restaurant's own location, which is already verified
 *   2. geocoding the address
 *   3. nothing, per Requirement 6.5 -- the offer is still saved
 *
 * When (3) happens and an address was supplied, `locationWarning` is returned so
 * the caller can tell the User that distance sorting will not include this
 * offer. Requirement 6.5 asks for exactly that message, and the server is the
 * only layer that knows which branch was taken.
 */
export async function createOffer(
  data: unknown,
  userId: string
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

  // Whether an address was asked to be resolved. Tracked separately from
  // `restaurant_location` so the warning below can distinguish "no address, so
  // none was expected" from "an address was given and we could not place it".
  const addressRequested =
    typeof parsed.data.restaurantAddress === 'string' &&
    parsed.data.restaurantAddress.trim().length > 0;

  // 1. The linked restaurant already has coordinates: reuse them rather than
  // paying Nominatim again for an address we have already resolved.
  if (parsed.data.restaurantId) {
    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('location')
      .eq('id', parsed.data.restaurantId)
      .single();

    if (restaurant?.location) {
      dbRow.restaurant_location = restaurant.location;
    }
  }

  // 2. Otherwise geocode, once, on the server, before the row exists. Only
  // when an address is present and we have no coordinates yet.
  if (!dbRow.restaurant_location && addressRequested) {
    try {
      const coordinates = await geocodeAddress(parsed.data.restaurantAddress!);
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
 * Update an existing offer.
 * Ownership must be verified by the caller (action layer) before calling this function.
 */
export async function updateOffer(
  id: string,
  data: unknown
): Promise<ActionResult<LunchOffer>> {
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

  return { success: true, data: mapDbRowToOffer(updated as DbLunchOffer) };
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
 */
function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Lists lunch offers with filtering, sorting, and pagination.
 *
 * Default behavior:
 * - Only returns offers for today (available_date = today)
 * - Max 50 offers per page
 * - When location is available and sortBy is 'distance', sorts by distance ascending
 * - When location is not available, sorts alphabetically by restaurant_name
 *
 * Filter logic:
 * - Price: min <= price <= max
 * - Cuisine: OR logic (match any selected cuisine)
 * - Dietary: AND logic (must have ALL selected tags)
 * - Search: case-insensitive partial match on dish_name and description (ilike)
 * - Distance: uses PostGIS get_offers_within_radius function
 * - Combined filters: AND logic (intersection of all active filters)
 */
export async function listOffers(
  filters: OfferFilters,
  userLocation?: Coordinates
): Promise<PaginatedOffers> {
  // Use the requested date if provided, otherwise default to today
  const today = filters.date ?? getTodayDate();

  const page = filters.page ?? 1;
  const limit = Math.min(filters.limit ?? 50, 50);
  const offset = (page - 1) * limit;

  // If distance filter is applied, use PostGIS spatial query
  if (filters.distance) {
    return listOffersWithDistance(filters, filters.distance.from, today, page, limit, offset);
  }

  // If user has location and wants to sort by distance, use spatial query
  if (userLocation && filters.sortBy === 'distance') {
    return listOffersWithDistance(filters, userLocation, today, page, limit, offset);
  }

  // Standard query without distance
  return listOffersStandard(filters, today, page, limit, offset);
}

/**
 * Lists offers using standard Supabase query (no spatial filtering).
 */
async function listOffersStandard(
  filters: OfferFilters,
  today: string,
  page: number,
  limit: number,
  offset: number
): Promise<PaginatedOffers> {
  const supabase = await createClient();

  let query = supabase
    .from('lunch_offers')
    .select('*', { count: 'exact' })
    .eq('available_date', today);

  // Apply price filter
  if (filters.price) {
    query = query.gte('price', filters.price.min).lte('price', filters.price.max);
  }

  // Apply cuisine type filter (OR logic — match any selected cuisine)
  if (filters.cuisineTypes && filters.cuisineTypes.length > 0) {
    query = query.in('cuisine_type', filters.cuisineTypes);
  }

  // Apply dietary tags filter (AND logic — must have ALL selected tags)
  if (filters.dietaryTags && filters.dietaryTags.length > 0) {
    for (const tag of filters.dietaryTags) {
      query = query.contains('dietary_tags', [tag]);
    }
  }

  // Apply full-text search (case-insensitive partial match on dish_name and description)
  if (filters.searchQuery && filters.searchQuery.length >= 2) {
    const searchPattern = `%${filters.searchQuery}%`;
    query = query.or(
      `dish_name.ilike.${searchPattern},description.ilike.${searchPattern}`
    );
  }

  // Apply sorting
  switch (filters.sortBy) {
    case 'price_asc':
      query = query.order('price', { ascending: true });
      break;
    case 'price_desc':
      query = query.order('price', { ascending: false });
      break;
    case 'newest':
      query = query.order('created_at', { ascending: false });
      break;
    case 'distance':
    default:
      // Without location, sort alphabetically by restaurant name
      query = query.order('restaurant_name', { ascending: true });
      break;
  }

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch offers: ${error.message}`);
  }

  const total = count ?? 0;
  const offers: LunchOfferWithDistance[] = (data ?? []).map((row) =>
    mapDbRowToOfferWithDistance(row as Record<string, unknown>, null)
  );

  return {
    offers,
    total,
    page,
    limit,
    hasMore: offset + limit < total,
  };
}

/**
 * Lists offers with distance calculation using PostGIS RPC.
 * Used when distance filter is active or when sorting by distance with user location.
 *
 * Strategy:
 * 1. Get IDs of offers within radius using get_offers_within_radius RPC
 * 2. Fetch full records for those IDs with additional filters applied
 * 3. Sort and paginate in application layer (since distance comes from RPC)
 */
async function listOffersWithDistance(
  filters: OfferFilters,
  location: Coordinates,
  today: string,
  page: number,
  limit: number,
  offset: number
): Promise<PaginatedOffers> {
  const supabase = await createClient();
  const radius = filters.distance?.radius ?? 25;

  // Step 1: Get offers within radius using PostGIS RPC function
  const { data: spatialData, error: spatialError } = await supabase.rpc(
    'get_offers_within_radius',
    {
      user_lat: location.latitude,
      user_lng: location.longitude,
      radius_km: radius,
    }
  );

  if (spatialError) {
    throw new Error(`Failed to fetch offers within radius: ${spatialError.message}`);
  }

  if (!spatialData || spatialData.length === 0) {
    return {
      offers: [],
      total: 0,
      page,
      limit,
      hasMore: false,
    };
  }

  // Build a map of id -> distance_km from spatial results
  const distanceMap = new Map<string, number>();
  for (const row of spatialData) {
    distanceMap.set(row.id, row.distance_km);
  }

  const spatialIds = Array.from(distanceMap.keys());

  // Step 2: Fetch full records for these IDs with additional filters
  let query = supabase
    .from('lunch_offers')
    .select('*', { count: 'exact' })
    .eq('available_date', today)
    .in('id', spatialIds);

  // Apply price filter
  if (filters.price) {
    query = query.gte('price', filters.price.min).lte('price', filters.price.max);
  }

  // Apply cuisine type filter (OR logic)
  if (filters.cuisineTypes && filters.cuisineTypes.length > 0) {
    query = query.in('cuisine_type', filters.cuisineTypes);
  }

  // Apply dietary tags filter (AND logic)
  if (filters.dietaryTags && filters.dietaryTags.length > 0) {
    for (const tag of filters.dietaryTags) {
      query = query.contains('dietary_tags', [tag]);
    }
  }

  // Apply full-text search
  if (filters.searchQuery && filters.searchQuery.length >= 2) {
    const searchPattern = `%${filters.searchQuery}%`;
    query = query.or(
      `dish_name.ilike.${searchPattern},description.ilike.${searchPattern}`
    );
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch filtered offers: ${error.message}`);
  }

  const total = count ?? 0;

  // Step 3: Map rows to offers with distance and sort
  const offers: LunchOfferWithDistance[] = (data ?? []).map((row) => {
    const distance = distanceMap.get(row.id as string) ?? null;
    return mapDbRowToOfferWithDistance(row as Record<string, unknown>, distance);
  });

  // Sort in application layer (distance data comes from RPC, not from DB query)
  switch (filters.sortBy ?? 'distance') {
    case 'price_asc':
      offers.sort((a, b) => a.price - b.price);
      break;
    case 'price_desc':
      offers.sort((a, b) => b.price - a.price);
      break;
    case 'newest':
      offers.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      break;
    case 'distance':
    default:
      offers.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
      break;
  }

  // Apply pagination in application layer
  const paginatedOffers = offers.slice(offset, offset + limit);

  return {
    offers: paginatedOffers,
    total,
    page,
    limit,
    hasMore: offset + limit < total,
  };
}
