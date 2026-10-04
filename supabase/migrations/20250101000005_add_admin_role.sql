-- Migration: let an admin modify any record, on both tables
-- Part 1 of #54. Part 2 adds the audit log these actions will write to.
--
-- Why this is a migration and not just application code:
--
-- `AGENTS.md` documents a two-layer model -- RLS here, `checkOwnership()` in
-- `src/actions/*.ts` -- where neither layer suffices alone. An admin bypass
-- added only to the application layer fails *silently*:
--
--   1. the action checks `canModify`, sees the admin role, proceeds
--   2. RLS filters the row out of the UPDATE, so it matches zero rows
--   3. PostgREST returns 200 with an empty body and no error
--   4. `if (error)` is false, so the action reports success
--
-- `__tests__/db/authorization.test.ts` documents exactly this for anonymous
-- callers. It applies here identically, which is why the policy and the
-- application change land together.
--
-- Why `app_metadata`, not `user_metadata`: `user_metadata` is writable by the
-- account holder through `supabase.auth.updateUser`, so a policy reading it
-- would honour a role anyone assigns to themselves. `app_metadata` needs the
-- service role, and is signed into the JWT, which is what makes it readable here
-- at all. The role is assigned by hand in the Supabase dashboard; there is no UI
-- and no self-service.
--
-- On `ON DELETE SET NULL`, which is unchanged: an offer whose owner's account was
-- deleted keeps `user_id IS NULL` and becomes an orphan. It is now reclaimable,
-- which was the point of #6. It is deliberately *not* CASCADE, because with an
-- admin able to reclaim the record, deleting it instead would lose data for
-- nothing.

-- ============================================================
-- Reading the role
-- ============================================================

-- Wrapped in a function rather than repeated inline, because the same
-- expression appears in four policies and a typo in one copy would be a policy
-- that silently never matches -- an admin bypass that does not work, discovered
-- only by trying it.
--
-- `auth.jwt()` is the verified JWT, so the value cannot be influenced by
-- anything the caller sends. STABLE because it reads no table.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'True when the caller''s signed JWT carries app_metadata.role = ''admin''. '
  'Reads app_metadata rather than user_metadata because the latter is client-writable. '
  'Assigned by hand in the Supabase dashboard; see #56.';

-- The policies below compare against this rather than the literal, so the
-- function's own RETURNS type does the boolean conversion and a NULL claim
-- yields false instead of NULL. NULL would make `USING (NULL)` fail closed, which
-- happens to be safe, but it makes the policy read as though it might pass.
--
-- Kept explicit rather than relying on that: the expression is the authorization
-- decision, and it is worth being able to read it in one piece.

-- ============================================================
-- restaurants
-- ============================================================

-- Replaces `owners can modify restaurants` from 20250101000000 rather than
-- adding a second policy. Postgres ORs the USING clauses of permissive policies
-- for the same command, so adding one would widen the policy without touching the
-- old definition -- and two policies each named "owners can modify" would be a
-- puzzle for the next reader. One policy, one place where the rule is written.
DROP POLICY IF EXISTS "owners can modify restaurants" ON restaurants;

CREATE POLICY "owners and admins can modify restaurants"
  ON restaurants
  FOR ALL
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- ============================================================
-- lunch_offers
-- ============================================================

DROP POLICY IF EXISTS "owners can modify lunch_offers" ON lunch_offers;

CREATE POLICY "owners and admins can modify lunch_offers"
  ON lunch_offers
  FOR ALL
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- Note what the admin branch does *not* change: the `public read` policies are
-- untouched, so admins read through the same public path as anyone else. No
-- privileged read is introduced, because none is needed -- everything is already
-- readable.

-- A record with `user_id IS NULL` still fails `auth.uid() = user_id`, since that
-- is NULL = NULL and therefore not true. The admin clause is the only thing that
-- can now reach it, which is the intended change and the reason the `checkOwnership`
-- comment in `src/lib/ownership.ts` still says an ownerless record belongs to
-- nobody: that stays true of every User who is not an admin.