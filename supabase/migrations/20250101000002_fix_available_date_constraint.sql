-- Migration: Fix available_date constraint so it only applies on INSERT
-- The original CHECK constraint fires on every UPDATE (including the migration RPC),
-- which causes code 23514 when migrating past-dated offers to a user_id.
-- Solution: drop the table-level CHECK and replace it with a trigger that only
-- validates available_date on INSERT.

-- 1. Drop the existing CHECK constraint on available_date
ALTER TABLE lunch_offers
  DROP CONSTRAINT IF EXISTS lunch_offers_available_date_check;

-- 2. Create a trigger function that validates available_date only on INSERT
CREATE OR REPLACE FUNCTION check_available_date_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.available_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'available_date must be >= today (got %)', NEW.available_date
      USING ERRCODE = '23514';
  END IF;
  IF NEW.available_date > CURRENT_DATE + INTERVAL '30 days' THEN
    RAISE EXCEPTION 'available_date must be within 30 days from today (got %)', NEW.available_date
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Attach the trigger — BEFORE INSERT only (not UPDATE)
DROP TRIGGER IF EXISTS trg_check_available_date ON lunch_offers;
CREATE TRIGGER trg_check_available_date
  BEFORE INSERT ON lunch_offers
  FOR EACH ROW
  EXECUTE FUNCTION check_available_date_on_insert();
