import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Helpers for the `db` project. Nothing here is mocked, by construction.
 *
 * These tests talk to PostgREST and to SQL functions directly rather than
 * through `src/lib/supabase/server.ts`, because that module reads
 * `next/headers` and there is no Next request context in a Vitest process.
 * What is being verified here is the database: PostGIS, RLS and migration
 * state. The server layer is Playwright's job.
 */

export function adminClient(): SupabaseClient {
  return createClient(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export function anonClient(): SupabaseClient {
  return createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * `CURRENT_DATE` in Postgres is the UTC date, and so is this. The radius
 * function hardcodes `CURRENT_DATE`, so a test inserting yesterday's date in
 * local time would silently be filtered out and the test would pass for the
 * wrong reason.
 */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function runToken(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface OfferSeed {
  dishName: string;
  restaurantName?: string;
  price?: number;
  /** `{ lon, lat }`, or null to omit coordinates entirely. */
  location?: { lon: number; lat: number } | null;
  sessionToken: string;
}

/**
 * PostgREST accepts PostGIS EWKT for a `geography` column, which keeps these
 * tests free of a SQL helper function. Verified: `SRID=4326;POINT(21.0122
 * 52.2297)` inserts and reads back as WKB hex.
 */
export function offerRow(seed: OfferSeed): Record<string, unknown> {
  const row: Record<string, unknown> = {
    dish_name: seed.dishName,
    price: seed.price ?? 25.0,
    restaurant_name: seed.restaurantName ?? 'Test Restaurant',
    available_date: todayUtc(),
    source_type: 'text',
    session_token: seed.sessionToken,
  };

  if (seed.location) {
    row.restaurant_location = `SRID=4326;POINT(${seed.location.lon} ${seed.location.lat})`;
  }

  return row;
}

export async function insertOffer(
  client: SupabaseClient,
  seed: OfferSeed,
): Promise<{ id: string }> {
  const { data, error } = await client
    .from('lunch_offers')
    .insert(offerRow(seed))
    .select('id')
    .single();

  if (error) throw new Error(`insert failed: ${error.message}`);
  return data as { id: string };
}

/**
 * Deletes by exact token, never by prefix. `auth.spec.ts` already leaves rows
 * behind on a shared project; these should not add to that.
 */
export async function deleteOffersWithToken(client: SupabaseClient, token: string): Promise<void> {
  const { error } = await client.from('lunch_offers').delete().eq('session_token', token);
  if (error) throw new Error(`cleanup failed: ${error.message}`);
}

export const WARSAW = { lon: 21.0122, lat: 52.2297 };