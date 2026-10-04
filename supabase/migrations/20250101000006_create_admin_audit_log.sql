-- Migration: admin_audit_log, append-only, recording every admin mutation
-- Part 2 of #54. Part 1 added the admin role and the RLS policy that admits it.
--
-- Why a separate table rather than a column on the record:
--
-- A column cannot log the record's own deletion. `deleted_by` on `lunch_offers`
-- dies with the row, which means "admin may delete an owned record, and it is
-- logged" is satisfied by nothing else. The subject has to be able to disappear
-- while the record of it survives.
--
-- Consequence, and the reason `record_id` has no foreign key: a FK would either
-- cascade the log row away with the record or block the deletion outright. The
-- second is the behaviour being logged.

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  -- UUID rather than BIGSERIAL, matching the id of every row this table
  -- describes. A serial would also mean PostgREST returns it as a JS number while
  -- `record_id` stays a string, so the two ids on one row would have different
  -- types for no reason. Verified: a BIGSERIAL id came back as `45`.
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who did it. NOT NULL: an anonymous caller cannot reach an admin code path,
  -- so a null actor means something wrote here without an identity, which is
  -- exactly what this table exists to make visible.
  actor_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  -- 'update' | 'delete'. Deliberately not an enum: adding a value then needs a
  -- migration, and a CHECK is one line and reads the same.
  action     TEXT NOT NULL CHECK (action IN ('update', 'delete')),

  -- Which table the subject lived in, as a value rather than a relation. Two
  -- tables are already covered and a third would otherwise need its own log.
  table_name TEXT NOT NULL CHECK (table_name IN ('lunch_offers', 'restaurants')),

  -- Intentionally not a foreign key -- see the header.
  record_id  UUID NOT NULL,

  -- The row before and after. `before` is null for a record that was created
  -- after this shipped, and both are null for a delete unless the caller
  -- captured it, which the delete paths do.
  before     JSONB,
  after      JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Read by record, which is the question an operator actually asks: "what
-- happened to this row?" A composite index on (table_name, record_id) answers
-- that in one scan.
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_record
  ON public.admin_audit_log (table_name, record_id, created_at DESC);

-- Read by actor, for "what has this operator done?". Created_at leads because
-- the usual question is recent-first over a window.
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor
  ON public.admin_audit_log (actor_id, created_at DESC);

COMMENT ON TABLE public.admin_audit_log IS
  'Append-only record of admin mutations (#54). Rows are only ever inserted: there is '
  'no UPDATE or DELETE policy on this table for anyone, admin included, so an operator '
  'cannot erase the record of their own action. Read it with SQL for now; a read view '
  'is #55.';

COMMENT ON COLUMN public.admin_audit_log.actor_id IS
  'The admin who acted. ON DELETE SET NULL so deleting an account does not cascade the '
  'log away -- the row survives, attributed to a user id that no longer resolves. Losing '
  'who it was beats losing that it happened.';

-- ============================================================
-- Policies: deliberately asymmetric with the other two tables
-- ============================================================

-- RLS on, and no policy at all for UPDATE or DELETE. That absence is the
-- mechanism: with RLS enabled and no permissive UPDATE/DELETE policy, both
-- operations match zero rows. This is the one place an admin has *less* power
-- than an ordinary User, and that is the point -- an admin who can rewrite the
-- log has no log.
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Readable by admins. Not public: this is the record of who changed what, and it
-- would be a map of who runs this service.
CREATE POLICY "admins can read the audit log"
  ON public.admin_audit_log
  FOR SELECT
  USING (public.is_admin());

-- Inserted by the application. A plain policy rather than SECURITY DEFINER,
-- because the caller is already an authenticated admin whose JWT says so -- this
-- needs no extra authority, only the permission that policy 00005 already grants.
--
-- Note this admits an admin to write *arbitrary* log rows through PostgREST,
-- including rows naming somebody else as actor_id. The log is therefore a record
-- of intent by a trusted operator, not a tamper-proof audit trail. What it does
-- prevent is the ordinary failure: an admin quietly editing or deleting the
-- evidence of their own action. Closing the forge path needs a trigger, which is
-- noted in #54 as the deliberate follow-up.
CREATE POLICY "admins can insert into the audit log"
  ON public.admin_audit_log
  FOR INSERT
  WITH CHECK (public.is_admin());

-- No UPDATE policy and no DELETE policy. See above.