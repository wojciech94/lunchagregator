-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create lunch_offers table
CREATE TABLE lunch_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_name TEXT NOT NULL CHECK (char_length(dish_name) <= 100),
  price NUMERIC(6,2) NOT NULL CHECK (price >= 0.01 AND price <= 9999.99),
  currency TEXT NOT NULL DEFAULT 'PLN',
  description TEXT CHECK (char_length(description) <= 500),
  restaurant_name TEXT NOT NULL CHECK (char_length(restaurant_name) <= 100),
  restaurant_address TEXT CHECK (char_length(restaurant_address) <= 200),
  restaurant_location GEOGRAPHY(POINT, 4326),
  available_date DATE NOT NULL CHECK (available_date >= CURRENT_DATE AND available_date <= CURRENT_DATE + INTERVAL '30 days'),
  cuisine_type TEXT,
  dietary_tags TEXT[] DEFAULT '{}',
  allergens TEXT[] DEFAULT '{}',
  source_type TEXT NOT NULL CHECK (source_type IN ('link', 'text', 'photo')),
  session_token TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_offers_available_date ON lunch_offers(available_date);
CREATE INDEX idx_offers_price ON lunch_offers(price);
CREATE INDEX idx_offers_cuisine ON lunch_offers(cuisine_type);
CREATE INDEX idx_offers_dietary ON lunch_offers USING GIN(dietary_tags);
CREATE INDEX idx_offers_session ON lunch_offers(session_token);
CREATE INDEX idx_offers_location ON lunch_offers USING GIST(restaurant_location);
CREATE INDEX idx_offers_search ON lunch_offers USING GIN(
  to_tsvector('simple', coalesce(dish_name, '') || ' ' || coalesce(description, ''))
);

-- Function to get offers within a radius from user location
CREATE OR REPLACE FUNCTION get_offers_within_radius(
  user_lat DOUBLE PRECISION,
  user_lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION
)
RETURNS TABLE (
  id UUID,
  dish_name TEXT,
  price NUMERIC,
  description TEXT,
  restaurant_name TEXT,
  distance_km DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    lo.id,
    lo.dish_name,
    lo.price,
    lo.description,
    lo.restaurant_name,
    ROUND((ST_Distance(
      lo.restaurant_location,
      ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
    ) / 1000.0)::numeric, 1)::double precision AS distance_km
  FROM lunch_offers lo
  WHERE lo.available_date = CURRENT_DATE
    AND lo.restaurant_location IS NOT NULL
    AND ST_DWithin(
      lo.restaurant_location,
      ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
      radius_km * 1000
    )
  ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql;
