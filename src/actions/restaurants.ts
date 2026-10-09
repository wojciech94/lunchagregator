'use server';

import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { menuToday } from '@/lib/recurring-menu';
import { canDelete, canModify, isAdmin } from '@/lib/ownership';
import { recordAudit, shouldAudit } from '@/lib/audit';
import { createRestaurantSchema, updateRestaurantSchema } from '@/schemas/restaurant.schema';
import { geocodeAddress } from '@/services/geocoding';
import type {
  CreateRestaurantInput,
  UpdateRestaurantInput,
  Restaurant,
  RestaurantFilters,
  PaginatedRestaurants,
  RestaurantWithDistance,
  RestaurantSummary,
} from '@/types/restaurants';
import type { Coordinates } from '@/types/offers';

// ============================================================================
// Types
// ============================================================================

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

// ============================================================================
// Database Row Type
// ============================================================================

interface DbRestaurant {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  location: string | null;
  price_level: string | null;
  lunch_hours_start: string | null;
  lunch_hours_end: string | null;
  cuisine_types: string[];
  phone_number: string | null;
  website_url: string | null;
  session_token: string | null;
  user_id: string | null;
  menu_recurs_weekly: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parses PostGIS geography point to Coordinates or null.
 * Handles both GeoJSON format and WKT POINT(lng lat) format.
 */
function parseLocation(location: string | null): Coordinates | null {
  if (!location) return null;

  // Handle GeoJSON format from Supabase
  if (typeof location === 'object') {
    const geo = location as unknown as {
      type: string;
      coordinates: [number, number];
    };
    if (geo.type === 'Point' && geo.coordinates) {
      return {
        latitude: geo.coordinates[1],
        longitude: geo.coordinates[0],
      };
    }
  }

  // Handle WKT format: POINT(lng lat)
  if (typeof location === 'string') {
    const match = location.match(
      /POINT\(([+-]?\d+\.?\d*)\s+([+-]?\d+\.?\d*)\)/
    );
    if (match) {
      return {
        latitude: parseFloat(match[2]),
        longitude: parseFloat(match[1]),
      };
    }
  }

  return null;
}

/**
 * Maps a database row (snake_case) to a Restaurant (camelCase).
 */
function mapDbRowToRestaurant(row: DbRestaurant): Restaurant {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    address: row.address,
    location: parseLocation(row.location),
    priceLevel: row.price_level as Restaurant['priceLevel'],
    lunchHours:
      row.lunch_hours_start && row.lunch_hours_end
        ? { start: row.lunch_hours_start, end: row.lunch_hours_end }
        : null,
    cuisineTypes: (row.cuisine_types ?? []) as Restaurant['cuisineTypes'],
    phoneNumber: row.phone_number,
    websiteUrl: row.website_url,
    sessionToken: row.session_token,
    userId: row.user_id,
    menuRecursWeekly: row.menu_recurs_weekly,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================================
// Server Actions
// ============================================================================

/**
 * Server action to create a new restaurant.
 * Validates input with Zod, geocodes address if provided (and no location given),
 * inserts into Supabase, and returns the created restaurant.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */
export async function createRestaurant(
  data: CreateRestaurantInput
): Promise<ActionResult<Restaurant>> {
  // 0. Verify authentication
  const user = await getUser();
  if (!user) {
    return { success: false, error: 'Brak autoryzacji' };
  }

  // 1. Validate input with Zod
  const parsed = createRestaurantSchema.safeParse(data);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      fieldErrors[path] = issue.message;
    }
    return {
      success: false,
      error: 'Nieprawidłowe dane restauracji',
      fieldErrors,
    };
  }

  const validated = parsed.data;

  // 2. Geocode address if provided but no location coordinates given
  let location: Coordinates | null = validated.location ?? null;
  if (validated.address && !location) {
    const geocoded = await geocodeAddress(validated.address);
    if (geocoded) {
      location = geocoded;
    }
    // If geocoding fails, proceed without coordinates (per requirement 1.5)
  }

  // 3. Build database row (camelCase → snake_case)
  const dbRow: Record<string, unknown> = {
    name: validated.name,
    description: validated.description ?? null,
    address: validated.address ?? null,
    price_level: validated.priceLevel ?? null,
    lunch_hours_start: validated.lunchHours?.start ?? null,
    lunch_hours_end: validated.lunchHours?.end ?? null,
    cuisine_types: validated.cuisineTypes ?? [],
    phone_number: validated.phoneNumber ?? null,
    website_url: validated.websiteUrl ?? null,
    user_id: user.id,
  };

  // Set location as PostGIS POINT format if coordinates are available
  if (location) {
    dbRow.location = `POINT(${location.longitude} ${location.latitude})`;
  }

  // 4. Insert into Supabase
  const supabase = await createClient();

  const { data: inserted, error } = await supabase
    .from('restaurants')
    .insert(dbRow)
    .select('*')
    .single();

  if (error) {
    return {
      success: false,
      error: `Nie udało się utworzyć restauracji: ${error.message}`,
    };
  }

  return { success: true, data: mapDbRowToRestaurant(inserted as DbRestaurant) };
}

/**
 * Read the full deletion impact for an authorized owner/admin, including expired offers.
 * Query errors remain errors rather than an apparent count of zero.
 */
export async function countRestaurantLinkedOffers(id: string): Promise<ActionResult<number>> {
  try {
    if (!z.string().uuid().safeParse(id).success) {
      return { success: false, error: 'Nieprawidłowy identyfikator restauracji.' };
    }
    const user = await getUser();
    if (!user) return { success: false, error: 'Brak autoryzacji' };
    const supabase = await createClient();
    const { data: restaurant, error: restaurantError } = await supabase
      .from('restaurants').select('user_id').eq('id', id).single();
    if (restaurantError || !restaurant) return { success: false, error: 'Nie znaleziono restauracji.' };
    if (!canDelete(user, restaurant.user_id)) return { success: false, error: 'Brak uprawnień do tej operacji' };
    const { count, error } = await supabase.from('lunch_offers')
      .select('id', { count: 'exact', head: true }).eq('restaurant_id', id);
    if (error || typeof count !== 'number') return { success: false, error: 'Nie udało się policzyć powiązanych ofert. Spróbuj ponownie.' };
    return { success: true, data: count };
  } catch {
    return { success: false, error: 'Nie udało się policzyć powiązanych ofert. Spróbuj ponownie.' };
  }
}

/**
 * Delete a restaurant after authentication and authorization. FK ON DELETE SET NULL
 * detaches its offers without rewriting their published snapshots (#105).
 */
export async function deleteRestaurant(
  id: string
): Promise<ActionResult<void>> {
  // 0. Verify authentication
  const user = await getUser();
  if (!user) {
    return { success: false, error: 'Brak autoryzacji' };
  }

  const supabase = await createClient();

  // 1. Fetch existing restaurant
  const { data: existing, error: fetchError } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return {
      success: false,
      error: 'Nie znaleziono restauracji',
    };
  }

  const existingRow = existing as DbRestaurant;

  // 2. Verify ownership via user_id, or the admin role
  const actorIsAdmin = isAdmin(user);
  if (!canDelete(user, existingRow.user_id)) {
    return {
      success: false,
      error: 'Brak uprawnień do tej operacji',
    };
  }

  // One database delete detaches all linked offers, including another user's offers.
  // Their publication snapshots already exist and must remain unchanged.
  const { error: deleteError } = await supabase
    .from('restaurants')
    .delete()
    .eq('id', id);

  if (deleteError) {
    return {
      success: false,
      error: `Nie udało się usunąć restauracji: ${deleteError.message}`,
    };
  }

  // Logged last, after the delete succeeded -- there is no point recording an
  // action that did not happen.
  //
  // `supabase` is the caller's own client, so the insert is subject to the same
  // RLS policy as the delete above. A non-admin never reaches here: step 2
  // refuses them before any write.
  if (shouldAudit(actorIsAdmin)) {
    await recordAudit(supabase, user.id, {
      action: 'delete',
      tableName: 'restaurants',
      recordId: id,
      before: existingRow as unknown as Record<string, unknown>,
      after: null,
    });
  }

  return { success: true, data: undefined };
}

/**
 * Server action to update an existing restaurant.
 * Verifies ownership via user_id from getUser(), validates input with Zod,
 * re-geocodes if address changed, and updates in Supabase.
 *
 * Validates: Requirements 2.2, 2.3, 2.4, 2.5, 4.5, 5.3, 5.4, 5.5
 */
export async function updateRestaurant(
  id: string,
  data: UpdateRestaurantInput
): Promise<ActionResult<Restaurant>> {
  // 0. Verify authentication
  const user = await getUser();
  if (!user) {
    return { success: false, error: 'Brak autoryzacji' };
  }

  const supabase = await createClient();

  // 1. Fetch existing restaurant
  const { data: existing, error: fetchError } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return {
      success: false,
      error: 'Nie znaleziono restauracji',
    };
  }

  const existingRow = existing as DbRestaurant;

  // 2. Verify ownership via user_id, or the admin role
  const actorIsAdmin = isAdmin(user);
  if (!canModify(user, existingRow.user_id)) {
    return {
      success: false,
      error: 'Brak uprawnień do tej operacji',
    };
  }

  // 3. Validate input with Zod
  const parsed = updateRestaurantSchema.safeParse(data);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      fieldErrors[path] = issue.message;
    }
    return {
      success: false,
      error: 'Nieprawidłowe dane restauracji',
      fieldErrors,
    };
  }

  const validated = parsed.data;

  // 4. Re-geocode if address changed
  let newLocation: Coordinates | null | undefined = validated.location;
  const addressChanged =
    validated.address !== undefined && validated.address !== existingRow.address;

  if (addressChanged && validated.address && newLocation === undefined) {
    const geocoded = await geocodeAddress(validated.address);
    if (geocoded) {
      newLocation = geocoded;
    }
    // If geocoding fails, proceed without updating coordinates
  }

  // 5. Build update object (only include defined fields)
  const updateObj: Record<string, unknown> = {};

  if (validated.name !== undefined) {
    updateObj.name = validated.name;
  }
  if (validated.description !== undefined) {
    updateObj.description = validated.description;
  }
  if (validated.address !== undefined) {
    updateObj.address = validated.address;
  }
  if (newLocation !== undefined) {
    updateObj.location = newLocation
      ? `POINT(${newLocation.longitude} ${newLocation.latitude})`
      : null;
  }
  if (validated.priceLevel !== undefined) {
    updateObj.price_level = validated.priceLevel;
  }
  if (validated.lunchHours !== undefined) {
    if (validated.lunchHours === null) {
      updateObj.lunch_hours_start = null;
      updateObj.lunch_hours_end = null;
    } else {
      updateObj.lunch_hours_start = validated.lunchHours.start;
      updateObj.lunch_hours_end = validated.lunchHours.end;
    }
  }
  if (validated.cuisineTypes !== undefined) {
    updateObj.cuisine_types = validated.cuisineTypes;
  }
  if (validated.phoneNumber !== undefined) {
    updateObj.phone_number = validated.phoneNumber;
  }
  if (validated.websiteUrl !== undefined) {
    updateObj.website_url = validated.websiteUrl;
  }

  // 6. Update in Supabase
  const { data: updated, error: updateError } = await supabase
    .from('restaurants')
    .update(updateObj)
    .eq('id', id)
    .select('*')
    .single();

  if (updateError) {
    return {
      success: false,
      error: `Nie udało się zaktualizować restauracji: ${updateError.message}`,
    };
  }

  // Only for an admin, and only after the update succeeded. `before` is the row
  // as read at step 1, which for an admin correcting somebody else's listing is
  // the only record of what was there before.
  if (shouldAudit(actorIsAdmin)) {
    await recordAudit(supabase, user.id, {
      action: 'update',
      tableName: 'restaurants',
      recordId: id,
      before: existingRow as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
    });
  }

  return { success: true, data: mapDbRowToRestaurant(updated as DbRestaurant) };
}

/**
 * Server action to fetch a single restaurant by ID with active offers count.
 * Returns the restaurant with distanceKm: null (no user location context) and
 * activeOffersCount populated from offers where available_date >= today.
 *
 * Validates: Requirements 4.3
 */
export async function getRestaurant(id: string): Promise<RestaurantWithDistance | null> {
  const supabase = await createClient();

  // 1. Fetch restaurant by ID
  const { data: row, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !row) {
    return null;
  }

  const dbRow = row as DbRestaurant;

  // 2. Count active offers (available_date >= today)
  const today = menuToday();

  const { count, error: countError } = await supabase
    .from('visible_lunch_offers')
    .select('*', { count: 'exact', head: true })
    .eq('restaurant_id', id)
    .gte('available_date', today);

  const activeOffersCount = !countError && count !== null ? count : 0;

  // 3. Map and return
  const restaurant = mapDbRowToRestaurant(dbRow);

  return {
    ...restaurant,
    distanceKm: null,
    activeOffersCount,
  };
}

/**
 * Server action to list restaurants with filters, sorting, and pagination.
 * Supports distance, price level, cuisine type, lunch hours, and text search filters.
 * Results are sorted alphabetically by name (case-insensitive) and paginated (max 50 per page).
 *
 * Validates: Requirements 4.1, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
export async function listRestaurants(
  filters: RestaurantFilters
): Promise<PaginatedRestaurants> {
  const supabase = await createClient();

  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(50, Math.max(1, filters.limit ?? 50));
  const offset = (page - 1) * limit;

  // 1. If distance filter is active, get restaurant IDs within radius via RPC
  let distanceMap: Map<string, number> | null = null;

  if (filters.distance) {
    const { data: nearbyRestaurants, error: rpcError } = await supabase.rpc(
      'get_restaurants_within_radius',
      {
        user_lat: filters.distance.from.latitude,
        user_lng: filters.distance.from.longitude,
        radius_km: filters.distance.radius,
      }
    );

    if (rpcError) {
      // If RPC fails, return empty results
      return {
        restaurants: [],
        total: 0,
        page,
        limit,
        hasMore: false,
      };
    }

    distanceMap = new Map<string, number>();
    for (const r of nearbyRestaurants ?? []) {
      distanceMap.set(r.id, r.distance_km);
    }

    // If no restaurants within radius, return empty
    if (distanceMap.size === 0) {
      return {
        restaurants: [],
        total: 0,
        page,
        limit,
        hasMore: false,
      };
    }
  }

  // 2. Build the main query
  let query = supabase
    .from('restaurants')
    .select('*', { count: 'exact' });

  // Filter by IDs from distance query
  if (distanceMap) {
    const ids = Array.from(distanceMap.keys());
    query = query.in('id', ids);
  }

  // Price level filter (OR logic)
  if (filters.priceLevels && filters.priceLevels.length > 0) {
    query = query.in('price_level', filters.priceLevels);
  }

  // Cuisine type filter (OR logic — overlaps with array)
  if (filters.cuisineTypes && filters.cuisineTypes.length > 0) {
    query = query.overlaps('cuisine_types', filters.cuisineTypes);
  }

  // Lunch hours filter: restaurants serving at the specified time
  if (filters.lunchTimeAt) {
    query = query
      .lte('lunch_hours_start', filters.lunchTimeAt)
      .gte('lunch_hours_end', filters.lunchTimeAt);
  }

  // Text search filter (min 2 characters, ILIKE on name and description)
  if (filters.searchQuery && filters.searchQuery.trim().length >= 2) {
    const searchTerm = `%${filters.searchQuery.trim()}%`;
    query = query.or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`);
  }

  // Sort alphabetically by name (case-insensitive) and paginate
  query = query
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1);

  const { data: rows, count, error } = await query;

  if (error) {
    return {
      restaurants: [],
      total: 0,
      page,
      limit,
      hasMore: false,
    };
  }

  const dbRows = (rows ?? []) as DbRestaurant[];
  const total = count ?? 0;

  // 3. Get active offers count for each restaurant
  const restaurantIds = dbRows.map((r) => r.id);
  const today = menuToday();

  const offersCountMap = new Map<string, number>();

  if (restaurantIds.length > 0) {
    const { data: offerCounts, error: offersError } = await supabase
      .from('visible_lunch_offers')
      .select('restaurant_id')
      .in('restaurant_id', restaurantIds)
      .gte('available_date', today);

    if (!offersError && offerCounts) {
      for (const offer of offerCounts) {
        const rid = offer.restaurant_id as string;
        offersCountMap.set(rid, (offersCountMap.get(rid) ?? 0) + 1);
      }
    }
  }

  // 4. Map to RestaurantWithDistance
  const restaurants: RestaurantWithDistance[] = dbRows.map((row) => {
    const restaurant = mapDbRowToRestaurant(row);
    return {
      ...restaurant,
      distanceKm: distanceMap?.get(row.id) ?? null,
      activeOffersCount: offersCountMap.get(row.id) ?? 0,
    };
  });

  return {
    restaurants,
    total,
    page,
    limit,
    hasMore: offset + limit < total,
  };
}

/**
 * Lightweight search for restaurants by name, returning RestaurantSummary[].
 * Used for the restaurant dropdown in the offer form.
 * Returns empty array if query is less than 2 characters.
 * Results are limited to 10 and sorted alphabetically by name.
 */
export async function searchRestaurants(query: string): Promise<RestaurantSummary[]> {
  if (query.trim().length < 2) {
    return [];
  }

  const supabase = await createClient();
  const searchTerm = `%${query.trim()}%`;

  const { data: rows, error } = await supabase
    .from('restaurants')
    .select('id, name, address, cuisine_types')
    .ilike('name', searchTerm)
    .order('name', { ascending: true })
    .limit(10);

  if (error || !rows) {
    return [];
  }

  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    address: (row.address as string | null) ?? null,
    cuisineTypes: ((row.cuisine_types as string[]) ?? []) as RestaurantSummary['cuisineTypes'],
  }));
}
