-- Migration: Add user_id to restaurants and lunch_offers
-- Supports Requirement 5.1 (restaurants) and 5.2 (lunch_offers)
-- user_id is nullable to preserve existing anonymous records during the migration period

-- ============================================================
-- restaurants
-- ============================================================

ALTER TABLE restaurants
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX idx_restaurants_user_id ON restaurants(user_id);

-- Drop the old permissive policies that relied on application-level session_token checks
DROP POLICY IF EXISTS "Anyone can insert restaurants" ON restaurants;
DROP POLICY IF EXISTS "Anyone can update restaurants" ON restaurants;
DROP POLICY IF EXISTS "Anyone can delete restaurants" ON restaurants;
DROP POLICY IF EXISTS "Anyone can read restaurants" ON restaurants;

-- Public read: anyone (including guests) can browse restaurants
CREATE POLICY "public read restaurants"
  ON restaurants
  FOR SELECT
  USING (true);

-- Owners can modify: authenticated users can INSERT/UPDATE/DELETE their own records
CREATE POLICY "owners can modify restaurants"
  ON restaurants
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- lunch_offers
-- ============================================================

ALTER TABLE lunch_offers
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX idx_lunch_offers_user_id ON lunch_offers(user_id);

-- Enable RLS on lunch_offers (was not enabled in previous migrations)
ALTER TABLE lunch_offers ENABLE ROW LEVEL SECURITY;

-- Public read: anyone can browse lunch offers
CREATE POLICY "public read lunch_offers"
  ON lunch_offers
  FOR SELECT
  USING (true);

-- Owners can modify: authenticated users can INSERT/UPDATE/DELETE their own records
CREATE POLICY "owners can modify lunch_offers"
  ON lunch_offers
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
