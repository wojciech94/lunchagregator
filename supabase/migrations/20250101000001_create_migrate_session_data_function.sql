-- Migration: Create migrate_session_data RPC function
-- Supports Requirements 6.2, 6.4, 6.5, 6.6
-- Migrates anonymous session_token records to an authenticated user_id in a single transaction

CREATE OR REPLACE FUNCTION migrate_session_data(
  p_session_token TEXT,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_restaurants_count INT;
  v_offers_count INT;
BEGIN
  -- Migrate restaurants (only where user_id IS NULL)
  UPDATE restaurants
  SET user_id = p_user_id
  WHERE session_token = p_session_token
    AND user_id IS NULL;
  GET DIAGNOSTICS v_restaurants_count = ROW_COUNT;

  -- Migrate offers (only where user_id IS NULL)
  UPDATE lunch_offers
  SET user_id = p_user_id
  WHERE session_token = p_session_token
    AND user_id IS NULL;
  GET DIAGNOSTICS v_offers_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'restaurants_migrated', v_restaurants_count,
    'offers_migrated', v_offers_count
  );
END;
$$;
