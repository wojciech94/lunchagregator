-- #88 review: default nearest-first ordering must not require a radius filter.
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
  v_origin GEOGRAPHY(POINT, 4326);
BEGIN
  IF p_user_lat IS NOT NULL AND p_user_lng IS NOT NULL THEN
    v_origin := ST_SetSRID(ST_MakePoint(p_user_lng, p_user_lat), 4326)::geography;
  END IF;

  -- Origin determines distance; radius only determines which rows are kept.
  -- Without an explicit radius retain distant and unlocated restaurants too.
  RETURN QUERY
  SELECT
    lo.id, lo.dish_name, lo.items, lo.price, lo.currency, lo.description,
    lo.restaurant_id, lo.restaurant_name, lo.restaurant_address,
    lo.restaurant_location, lo.available_date, lo.cuisine_type,
    lo.dietary_tags, lo.allergens, lo.source_type, lo.user_id,
    lo.session_token, lo.created_at, lo.updated_at,
    ROUND((ST_Distance(lo.restaurant_location, v_origin) / 1000.0)::numeric, 1)::double precision
  FROM lunch_offers lo
  WHERE lo.available_date = p_date
    AND (v_origin IS NULL OR p_radius_km IS NULL OR
      ST_DWithin(lo.restaurant_location, v_origin, p_radius_km * 1000))
    AND (p_price_min IS NULL OR lo.price >= p_price_min)
    AND (p_price_max IS NULL OR lo.price <= p_price_max)
    AND (p_cuisine_types IS NULL OR lo.cuisine_type = ANY (p_cuisine_types))
    AND (p_dietary_tags IS NULL OR p_dietary_tags <@ lo.dietary_tags)
    AND (p_search_query IS NULL
      OR lo.dish_name ILIKE '%' || p_search_query || '%'
      OR lo.description ILIKE '%' || p_search_query || '%')
  ORDER BY
    CASE WHEN p_sort_by = 'price_asc' THEN lo.price END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'price_desc' THEN lo.price END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'newest' THEN lo.created_at END DESC NULLS LAST,
    -- Sort on unrounded metres; the displayed one-decimal distance can tie.
    CASE WHEN COALESCE(p_sort_by, 'distance') = 'distance'
      THEN ST_Distance(lo.restaurant_location, v_origin) END ASC NULLS LAST,
    lo.restaurant_name ASC,
    lo.id ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION get_offers_filtered IS
  'One filtered, ordered, sliced offer query. Origin enables distance independently of radius; '
  'explicit price/newest ordering takes precedence. Unknown distances sort last.';