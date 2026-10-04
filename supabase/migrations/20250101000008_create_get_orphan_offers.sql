-- Migration: get_orphan_offers, the list behind the admin panel
-- Part 1 of #55. Parts 2 and 3 are the service, the action and the page.
--
-- Why not reuse get_offers_filtered (20250101000004):
--
-- It filters `available_date = p_date`, an equality, not a range. This page
-- wants every ownerless offer whatever its date, and an ownerless offer is not
-- confined to one day in two independent ways:
--
--   - a panel is about to be cleaned up, not about to be eaten from. The
--     relevant window is today plus the 30 days the schema allows, and an
--     operator who fixed nothing today will face the same list tomorrow.
--   - rows legitimately hold dates in the past. `available_date` is validated by
--     a BEFORE INSERT trigger (20250101000002), not a table CHECK, precisely so
--     that an offer can age past its own date instead of becoming unupdatable.
--     An offer inserted with a date ten days out is, eleven days later, an
--     offer whose available_date is behind us.
--
-- There is no p_date that means "any date". Widening it until it covers
-- everything is a query that lies about what it selects: it stays an equality,
-- so it needs one date per day to be exhaustive, and each call would silently
-- return a partial answer that looks complete.
--
-- Why `LANGUAGE sql` rather than the plpgsql of 20250101000004:
--
-- There is no conditional in this one. A WHERE clause and an ORDER BY do not
-- need a procedural wrapper, and plpgsql here would add a layer between the
-- question and the answer for no gain. 20250101000004 is plpgsql because it
-- branches on whether the caller supplied an origin.
--
-- Why `WHERE public.is_admin()` inside the function:
--
-- This is the part that is easy to get wrong. A Supabase RPC is exposed to
-- PostgREST, and PostgREST serves anon. A panel route guarded only in the
-- application would leave this function callable by anyone, so `SELECT * FROM
-- lunch_offers WHERE user_id IS NULL` would answer a question no other query in
-- the app can answer: not "what is on offer today", but "which of these offers
-- has nobody's name on it". Every row it returns is already world-readable
-- through the public read policy -- so this leaks no offer that anon cannot see
-- -- but the ownership status of each one is not public information, and it is
-- not information this service needs to publish.
--
-- So the function refuses rather than trusts the caller. is_admin() reads
-- `auth.jwt()`, which is the verified per-request JWT claim rather than a table
-- read, so it returns the same answer inside a SECURITY DEFINER function as it
-- does in a policy. An anonymous or non-admin caller gets zero rows, not an
-- error: a page that renders an empty list is less informative to a prober than
-- a 403, and the application guard in #55 already refuses before it gets here.
--
-- SECURITY DEFINER runs as the function owner, so RLS on lunch_offers is not
-- re-checked for the SELECT inside. That is acceptable for the same reason: the
-- public read policy already lets any caller read every offer, so there is no
-- row this function exposes that a plain SELECT would not. The is_admin()
-- predicate is a narrower gate on top of that, not a substitute for it.

CREATE OR REPLACE FUNCTION get_orphan_offers(
  p_limit INT DEFAULT 200
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
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- The column list matches get_offers_filtered minus distance_km, which has
  -- nothing to compute here: there is no origin, and a distance from nothing is
  -- null rather than zero. Matching the shape is what lets the service reuse
  -- the existing row mapper instead of growing a second one.
  SELECT
    lo.id,
    lo.dish_name,
    lo.items,
    lo.price,
    lo.currency,
    lo.description,
    lo.restaurant_id,
    lo.restaurant_name,
    lo.restaurant_address,
    lo.restaurant_location,
    lo.available_date,
    lo.cuisine_type,
    lo.dietary_tags,
    lo.allergens,
    lo.source_type,
    lo.user_id,
    lo.session_token,
    lo.created_at,
    lo.updated_at
  FROM lunch_offers lo
  WHERE public.is_admin()
    AND lo.user_id IS NULL
  -- Oldest first, because an offer sitting here longest is the one an operator
  -- most wants to see. NULLS LAST rather than NULLS FIRST on created_at: the
  -- column has a default but is not NOT NULL, so a row with no created_at is
  -- itself a datum problem, and it should not lead a cleanup list.
  --
  -- id as the tiebreak so the order is total. Without it, two offers saved in
  -- the same transaction -- the batch create path does exactly that -- come back
  -- in whatever order the plan produces, which makes a paging limit drop a
  -- different row on every call.
  ORDER BY lo.created_at ASC NULLS LAST, lo.id ASC
  -- One predicate over three inputs that would otherwise mean three different
  -- things: a NULL p_limit would remove the LIMIT entirely, a negative one is an
  -- error from Postgres, and 0 reads as "no limit" to a caller who means "none".
  -- GREATEST leaves exactly one of them -- the default -- as a way to get rows.
  LIMIT GREATEST(COALESCE(p_limit, 200), 1);
$$;

COMMENT ON FUNCTION get_orphan_offers IS
  'Offers with no owner, oldest first, for the admin panel (#55). Admin-only: '
  'returns zero rows to any other caller, including anon. There is no paging -- '
  'p_limit is a cap, not a page size, and a caller that needs to see past it '
  'needs a filter this function does not have yet.';

-- Index: already present since 20250101000000. `user_id IS NULL` is a plain
-- equality against a btree, so idx_lunch_offers_user_id serves it and nothing
-- here needs one. Recorded because "add an index for the new query" is the
-- reflex and here it would be dead weight on every write.
