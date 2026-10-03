-- Migration: Add user_id to restaurants and lunch_offers
-- Supports Requirement 5.1 (restaurants) and 5.2 (lunch_offers)
-- user_id is nullable to preserve existing anonymous records during the migration period
--
-- This migration is the authority on authorization. It drops the permissive
-- "Anyone can update/delete ..." policies from 20240202000000 and replaces
-- them with ownership checks in the database itself.
--
-- Ownership is enforced twice, independently:
--   1. Database  - "owners can modify ..." below, via auth.uid() = user_id
--   2. Application - src/actions/*.ts, via getUser() + checkOwnership()
--
-- Either one alone is sufficient to block the write. Removing both would allow
-- any caller to modify any record.

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

-- Owners can modify: authenticated users can INSERT/UPDATE/DELETE their own records.
--
-- Note on anonymous and un-migrated records: auth.uid() is NULL when there is
-- no session, and user_id is NULL for records that predate this migration.
-- NULL = anything is NULL, which is not true, so neither an anonymous caller
-- nor an un-migrated record is writable. That is deliberate: an un-migrated
-- record has no identifiable owner, so no one may claim it. Records from the
-- anonymous era become editable only through migrate_session_data()
-- (20250101000001), which assigns user_id in a single transaction.
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
