-- Create restaurants table
CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 100),
  description TEXT CHECK (char_length(description) <= 500),
  address TEXT CHECK (char_length(address) <= 200),
  location GEOGRAPHY(POINT, 4326),
  price_level TEXT CHECK (price_level IN ('budżetowa', 'średnia', 'premium')),
  lunch_hours_start TIME,
  lunch_hours_end TIME,
  cuisine_types TEXT[] DEFAULT '{}',
  phone_number TEXT CHECK (char_length(phone_number) <= 20),
  website_url TEXT CHECK (char_length(website_url) <= 500),
  session_token TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Ensure at least address or location is provided
  CONSTRAINT restaurant_has_location CHECK (address IS NOT NULL OR location IS NOT NULL),
  -- Ensure lunch hours are valid if provided
  CONSTRAINT valid_lunch_hours CHECK (
    (lunch_hours_start IS NULL AND lunch_hours_end IS NULL) OR
    (lunch_hours_start IS NOT NULL AND lunch_hours_end IS NOT NULL AND lunch_hours_start < lunch_hours_end)
  )
);

-- Indexes for restaurants
CREATE INDEX idx_restaurants_name ON restaurants(name);
CREATE INDEX idx_restaurants_session ON restaurants(session_token);
CREATE INDEX idx_restaurants_location ON restaurants USING GIST(location);
CREATE INDEX idx_restaurants_price_level ON restaurants(price_level);
CREATE INDEX idx_restaurants_cuisine ON restaurants USING GIN(cuisine_types);
CREATE INDEX idx_restaurants_search ON restaurants USING GIN(
  to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, ''))
);

-- Add restaurant_id FK to lunch_offers (nullable for backward compatibility)
ALTER TABLE lunch_offers ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_offers_restaurant ON lunch_offers(restaurant_id);

-- Function to get restaurants within radius
CREATE OR REPLACE FUNCTION get_restaurants_within_radius(
  user_lat DOUBLE PRECISION,
  user_lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  distance_km DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.name,
    ROUND((ST_Distance(
      r.location,
      ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
    ) / 1000.0)::numeric, 1)::double precision AS distance_km
  FROM restaurants r
  WHERE r.location IS NOT NULL
    AND ST_DWithin(
      r.location,
      ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
      radius_km * 1000
    )
  ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql;
