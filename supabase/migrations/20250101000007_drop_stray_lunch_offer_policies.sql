-- Migration: remove four policies that exist on the hosted project and in no
-- migration here
--
-- The hosted database carries four `lunch_offers` policies that were created
-- outside this repository, through the Supabase dashboard. They are not in any
-- file under `supabase/migrations/`, and nothing in the application needs them:
--
--   Allow public read      SELECT  USING (true)
--   Allow public insert    INSERT  WITH CHECK (true)
--   Allow update own offers UPDATE USING (true)
--   Allow delete own offers DELETE USING (true)
--
-- Two of them are inert. `Allow public read` duplicates `public read
-- lunch_offers` from 20250101000000, which is already USING (true).
--
-- Two of them are not, and they are the reason this migration exists. Postgres
-- ORs the USING clauses of *permissive* policies for the same command, and all
-- four are permissive. So for UPDATE the effective test became:
--
--   owners can modify lunch_offers   ->  (auth.uid() = user_id)
--   Allow update own offers          ->  true
--   ---------------------------------------------
--   OR-ed                              ->  true
--
-- Any authenticated account could therefore update or delete *any* offer, not
-- only its own. The names say "own"; the conditions do not.
--
-- `Allow public insert` is the same shape for INSERT, where the test is
-- WITH CHECK: a row carrying somebody else's `user_id` would be accepted.
--
-- Nothing is recreated here. The two policies from 20250101000000 already
-- express the intended model in full, and 20250101000005 replaces the
-- ownership one with an admin-aware version. Dropping the strays leaves that
-- sequence working unchanged.
--
-- Deliberately does NOT reference is_admin(): that function arrives with
-- 20250101000005, which the hosted project has not applied yet. Referencing
-- it here would make this migration fail on the project it is meant to repair.

-- Inert duplicate of `public read lunch_offers`.
DROP POLICY IF EXISTS "Allow public read" ON lunch_offers;

-- Effectively `auth.uid() = user_id OR true`.
DROP POLICY IF EXISTS "Allow update own offers" ON lunch_offers;

-- Effectively `auth.uid() = user_id OR true`.
DROP POLICY IF EXISTS "Allow delete own offers" ON lunch_offers;

-- Allows a row naming an arbitrary user_id.
DROP POLICY IF EXISTS "Allow public insert" ON lunch_offers;

-- Guard: the same four must never reappear. Anything that creates them has
-- gone through the dashboard rather than a migration, and the names are not
-- visible from here.
DO $$
DECLARE
  stray TEXT;
BEGIN
  SELECT string_agg(policyname, ', ')
  INTO stray
  FROM pg_policies
  WHERE tablename = 'lunch_offers'
    AND policyname IN (
      'Allow public read',
      'Allow public insert',
      'Allow update own offers',
      'Allow delete own offers'
    );

  IF stray IS NOT NULL THEN
    RAISE EXCEPTION
      'lunch_offers still carries dashboard-created policies: %', stray;
  END IF;
END;
$$;