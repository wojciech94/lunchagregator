-- SUPERSEDED by 20250101000000_add_user_id_to_restaurants_and_offers.sql
--
-- The four "Anyone can ..." policies below were dropped when Supabase Auth
-- replaced the anonymous `session_token` mechanism with `user_id`. They are
-- kept verbatim because this migration is already applied to existing
-- databases and must not be edited in place.
--
-- Current state of play (read that file for history, not for the live rules):
--   "public read restaurants"        FOR SELECT USING (true)
--   "owners can modify restaurants"  FOR ALL
--                                    USING (auth.uid() = user_id)
--                                    WITH CHECK (auth.uid() = user_id)
--
-- Do not reason about authorization from this file. The database enforces
-- ownership through the policies in 20250101000000; the application code in
-- src/actions/*.ts (getUser + checkOwnership) is a second, independent check.

-- Enable RLS on restaurants (likely already enabled by default)
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read restaurants (public listing)
CREATE POLICY "Anyone can read restaurants"
  ON restaurants FOR SELECT
  USING (true);

-- Allow anyone to insert restaurants (anonymous users with session tokens)
CREATE POLICY "Anyone can insert restaurants"
  ON restaurants FOR INSERT
  WITH CHECK (true);

-- Allow anyone to update restaurants (ownership checked in application code via session_token)
CREATE POLICY "Anyone can update restaurants"
  ON restaurants FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow anyone to delete restaurants (ownership checked in application code via session_token)
CREATE POLICY "Anyone can delete restaurants"
  ON restaurants FOR DELETE
  USING (true);
