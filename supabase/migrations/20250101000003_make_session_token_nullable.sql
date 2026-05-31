-- Migration: Make session_token nullable on restaurants and lunch_offers
-- The auth implementation replaced session_token ownership with user_id.
-- New records are created without a session_token, so the NOT NULL constraint
-- must be relaxed to allow the transition period.

ALTER TABLE restaurants
  ALTER COLUMN session_token DROP NOT NULL;

ALTER TABLE lunch_offers
  ALTER COLUMN session_token DROP NOT NULL;
