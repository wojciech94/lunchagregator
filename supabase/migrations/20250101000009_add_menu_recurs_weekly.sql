-- Req 8.7 (#71): the weekly-menu flag on the restaurant.
--
-- "Menu tygodniowe, do odwołania": an intent marker the owner (or an admin)
-- sets when the restaurant's lunch menu carries over week to week, and
-- revokes when it stops. It drives surfacing and priority on "Moje oferty"
-- only -- the renewal action never runs on its own. No cron, no background
-- materialization in v1; that decision is recorded in the design section of
-- the lunch-aggregator spec rather than silently dropped.
--
-- No new policies: the column updates through the existing restaurant
-- policies (public read, owner modify, admin edit).
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS menu_recurs_weekly BOOLEAN NOT NULL DEFAULT FALSE;
