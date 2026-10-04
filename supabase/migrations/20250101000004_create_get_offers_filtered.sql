-- Migration: replace get_offers_within_radius with one filtered, ordered, sliced query
-- Addresses #19, the database half. #20 removes the id-join from the service, #21 the
-- competing client sorts.
--
-- What was wrong with get_offers_within_radius:
--
--   - It returned six columns, so listOffersWithDistance had to build a Map of
--     id -> distance_km and then issue a second, unbounded query to fetch the rows
--     it did not already have. No LIMIT, no ORDER BY on that second query.
--   - It hardcoded available_date = CURRENT_DATE, which silently disagreed with
--     filters.date. Asking for another day through the distance path returned zero
--     rows rather than an error, and nothing said why.
--   - It had no search_path, so it resolved unqualified names against whatever the
--     caller's search_path happened to be.
--
-- A plain Supabase query cannot order by a computed ST_Distance, so an RPC is the
-- only way to sort by distance in the database. One function can do everything the
-- three application paths did, in one statement, sliced in SQL.
--
-- SECURITY DEFINER, following migrate_session_data (20250101000001). The reason is
-- the same there and here: this function is called by anon through PostgREST, and
-- relying on the caller having a search_path a function does not control is how
-- function hijacking works. RLS still applies to the SELECT inside, via the
-- `public read lunch_offers` policy -- SECURITY DEFINER changes whose privileges are
-- checked, not whether row-level security is.

CREATE OR REPLACE FUNCTION get_offers_filtered(
  p_date DATE DEFAULT CURRENT_DATE,
  p_price_min NUMERIC DEFAULT NULL,
  p_price_max NUMERIC DEFAULT NULL,
  p_cuisine_types TEXT[] DEFAULT NULL,
  p_dietary_tags TEXT[] DEFAULT NULL,
  p_search_query TEXT DEFAULT NULL,
  p_user_lat DOUBLE PRECISION DEFAULT NULL,
  p_user_lng DOUBLE PRECISION DEFAULT NULL,
  p_radius_km DOUBLE PRECISION DEFAULT NULL,
  p_sort_by TEXT DEFAULT 'distance',
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  dish_name TEXT,
  items TEXT[],
  price NUMERIC,
  currency TEXT,
  description TEXT,
  restaurant_id UUID,
  restaurant_name TEXT,
  restaurant_address TEXT,
  restaurant_location GEOGRAPHY(POINT, 4326),
  available_date DATE,
  cuisine_type TEXT,
  dietary_tags TEXT[],
  allergens TEXT[],
  source_type TEXT,
  user_id UUID,
  session_token TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  distance_km DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- One origin point for every ST_DWithin/ST_Distance in the statement, so the
  -- geometry is built once rather than per row.
  v_origin GEOGRAPHY(POINT, 4326);
  -- "Is the caller asking about distance at all?" Two things make that true:
  -- a radius filter, or a distance sort with a location in hand.
  v_has_location BOOLEAN;
BEGIN
  v_has_location := (p_user_lat IS NOT NULL AND p_user_lng IS NOT NULL);

  IF v_has_location THEN
    v_origin := ST_SetSRID(ST_MakePoint(p_user_lng, p_user_lat), 4326)::geography;
  END IF;

  -- A radius is only meaningful with a location and coordinates to measure. When
  -- either is missing the radius is ignored rather than returning nothing: the
  -- slider always sends a radius, so treating "no location yet" as "no results"
  -- would blank the list on first paint.
  IF v_has_location AND p_radius_km IS NOT NULL THEN
    -- The SELECT is wrapped because `ORDER BY distance_km` written directly in a
    -- plpgsql RETURN QUERY binds the name to the OUT parameter declared by
    -- RETURNS TABLE, not to the expression in the SELECT list. That parameter is
    -- NULL for every row while the sort runs, so every row ties and Postgres
    -- falls through to the next sort key -- which is how rows at distance 1.3
    -- came back before rows at distance 0. Verified against the local stack
    -- before this was understood, which is why the test asserts on ordering with
    -- several distinct distances rather than one.
    --
    -- Inside a subquery the name is an ordinary column alias, so the outer
    -- ORDER BY sees a real value.
    RETURN QUERY
    SELECT * FROM (
      SELECT
        lo.id, lo.dish_name, lo.items, lo.price, lo.currency, lo.description,
        lo.restaurant_id, lo.restaurant_name, lo.restaurant_address,
        lo.restaurant_location, lo.available_date, lo.cuisine_type,
        lo.dietary_tags, lo.allergens, lo.source_type, lo.user_id,
        lo.session_token, lo.created_at, lo.updated_at,
        ROUND((ST_Distance(lo.restaurant_location, v_origin) / 1000.0)::numeric, 1)::double precision AS distance_km
      FROM lunch_offers lo
      WHERE lo.available_date = p_date
        AND lo.restaurant_location IS NOT NULL
        AND ST_DWithin(lo.restaurant_location, v_origin, p_radius_km * 1000)
        AND (p_price_min IS NULL OR lo.price >= p_price_min)
        AND (p_price_max IS NULL OR lo.price <= p_price_max)
        AND (p_cuisine_types IS NULL OR lo.cuisine_type = ANY (p_cuisine_types))
        -- AND across tags, matching the `.contains()` loop this replaces.
        AND (p_dietary_tags IS NULL OR p_dietary_tags <@ lo.dietary_tags)
        AND (
        p_search_query IS NULL
        OR lo.dish_name ILIKE '%' || p_search_query || '%'
        OR lo.description ILIKE '%' || p_search_query || '%'
      )
    ) q
    ORDER BY distance_km ASC, restaurant_name ASC
    LIMIT p_limit OFFSET p_offset;
  ELSE
    -- No location, or no radius asked for: distance is undefined, so the column
    -- is null and ordering falls back to something meaningful. Requirement 1.2 says
    -- an unlocated list is alphabetical by restaurant name; an explicit price or
    -- newest sort still overrides that, which is why p_sort_by is consulted here
    -- rather than hardcoded.
    RETURN QUERY
    SELECT
      lo.id, lo.dish_name, lo.items, lo.price, lo.currency, lo.description,
      lo.restaurant_id, lo.restaurant_name, lo.restaurant_address,
      lo.restaurant_location, lo.available_date, lo.cuisine_type,
      lo.dietary_tags, lo.allergens, lo.source_type, lo.user_id,
      lo.session_token, lo.created_at, lo.updated_at,
      NULL::double precision
    FROM lunch_offers lo
    WHERE lo.available_date = p_date
      AND (p_price_min IS NULL OR lo.price >= p_price_min)
      AND (p_price_max IS NULL OR lo.price <= p_price_max)
      AND (p_cuisine_types IS NULL OR lo.cuisine_type = ANY (p_cuisine_types))
      AND (p_dietary_tags IS NULL OR p_dietary_tags <@ lo.dietary_tags)
      AND (
        p_search_query IS NULL
        OR lo.dish_name ILIKE '%' || p_search_query || '%'
        OR lo.description ILIKE '%' || p_search_query || '%'
      )
    ORDER BY
      CASE
        WHEN p_sort_by = 'price_asc' THEN lo.price END ASC NULLS LAST,
      CASE
        WHEN p_sort_by = 'price_desc' THEN lo.price END DESC NULLS LAST,
      CASE
        WHEN p_sort_by = 'newest' THEN lo.created_at END DESC NULLS LAST,
      lo.restaurant_name ASC,
      lo.id ASC
    LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$$;

COMMENT ON FUNCTION get_offers_filtered IS
  'One filtered, ordered, sliced query for the offer list. Replaces get_offers_within_radius (#19). '
  'distance_km is null when no origin is supplied, which is not the same as a distance of zero.';

-- The old function goes now rather than in a later migration: it is SECURITY
-- INVOKER with no search_path, and leaving two ways to ask the same question is
-- how the service ends up calling the wrong one. The exact signature is named
-- because DROP FUNCTION matches on it.
DROP FUNCTION IF EXISTS get_offers_within_radius(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION
);

-- The GIN index created by 20240101000000 is dropped for a reason. It indexes
-- to_tsvector('simple', ...), and this query uses ILIKE '%...%'. ILIKE cannot use
-- that index -- a leading wildcard has nothing to anchor on -- so it has never
-- served this query. Either the query becomes full-text, which changes what the
-- User's search means, or the index is dead weight on every write. #19 asks for
-- it to go; a follow-up can add a trigram index instead, which ILIKE can use.
DROP INDEX IF EXISTS idx_offers_search;