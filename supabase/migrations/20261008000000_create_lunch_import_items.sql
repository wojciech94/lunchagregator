-- #94 stage 2: one source item/date, independent of later manual offer edits.
CREATE TABLE public.lunch_import_items (
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL CHECK (source_id IN ('sofa', 'sushi')),
  item_key TEXT NOT NULL CHECK (item_key ~ '^[a-f0-9]{64}$'),
  available_date DATE NOT NULL,
  offer_id UUID REFERENCES public.lunch_offers(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (restaurant_id, source_id, item_key, available_date)
);
ALTER TABLE public.lunch_import_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage import linkage" ON public.lunch_import_items
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON public.lunch_import_items FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lunch_import_items TO authenticated;
GRANT ALL ON public.lunch_import_items TO service_role;

-- INVOKER retains RLS on both linkage and offers. The explicit role check is
-- independent of RLS. Claim + offer INSERT commit/rollback together; conflicting
-- claims wait on the PK and return the existing offer without updating it.
CREATE FUNCTION public.create_lunch_import_offer(
  p_source_id TEXT, p_item_key TEXT, p_fetched_at TIMESTAMPTZ,
  p_expected_name TEXT, p_expected_address TEXT, p_offer JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE
  v_row public.lunch_offers;
  v_restaurant public.restaurants;
  v_claim UUID;
  v_existing UUID;
  v_url TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  v_row := jsonb_populate_record(NULL::public.lunch_offers, p_offer);
  SELECT * INTO v_restaurant FROM public.restaurants WHERE id = v_row.restaurant_id FOR SHARE;
  IF NOT FOUND OR v_restaurant.name IS DISTINCT FROM p_expected_name
    OR v_restaurant.address IS DISTINCT FROM p_expected_address THEN
    RAISE EXCEPTION 'Restaurant binding changed';
  END IF;
  IF v_row.available_date IS NULL OR v_row.available_date < CURRENT_DATE
    OR v_row.available_date > CURRENT_DATE + 30 THEN
    RAISE EXCEPTION 'Invalid publication date';
  END IF;
  IF p_fetched_at IS NULL OR p_fetched_at < now() - interval '30 minutes'
    OR p_fetched_at > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'Preview expired';
  END IF;
  v_url := CASE p_source_id
    WHEN 'sofa' THEN 'https://www.sofa.wroclaw.pl/restauracja/sofa-lounge-restaurant'
    WHEN 'sushi' THEN 'https://sushifriendswroclaw.pl/' END;
  INSERT INTO public.lunch_import_items
    (restaurant_id, source_id, item_key, available_date, source_url, fetched_at, created_by)
  VALUES (v_row.restaurant_id, p_source_id, p_item_key, v_row.available_date, v_url, p_fetched_at, auth.uid())
  ON CONFLICT DO NOTHING RETURNING restaurant_id INTO v_claim;
  IF v_claim IS NULL THEN
    SELECT offer_id INTO v_existing FROM public.lunch_import_items
      WHERE restaurant_id = v_row.restaurant_id AND source_id = p_source_id
        AND item_key = p_item_key AND available_date = v_row.available_date;
    SELECT * INTO v_row FROM public.lunch_offers WHERE id = v_existing;
    RETURN jsonb_build_object('created', false, 'offer', CASE WHEN FOUND THEN to_jsonb(v_row) ELSE NULL END);
  END IF;
  -- A manual date correction keeps the original claim. Also recognize its
  -- current date on reimport instead of creating another offer for that day.
  SELECT lo.id INTO v_existing FROM public.lunch_import_items li
    JOIN public.lunch_offers lo ON lo.id = li.offer_id
    WHERE li.restaurant_id = v_restaurant.id AND li.source_id = p_source_id
      AND li.item_key = p_item_key AND lo.available_date = v_row.available_date
    LIMIT 1;
  IF v_existing IS NOT NULL THEN
    UPDATE public.lunch_import_items SET offer_id = v_existing
      WHERE restaurant_id = v_restaurant.id AND source_id = p_source_id
        AND item_key = p_item_key AND available_date = v_row.available_date;
    SELECT * INTO v_row FROM public.lunch_offers WHERE id = v_existing;
    RETURN jsonb_build_object('created', false, 'offer', to_jsonb(v_row));
  END IF;
  INSERT INTO public.lunch_offers
    (dish_name, items, price, currency, description, restaurant_id,
     restaurant_name, restaurant_address, restaurant_location, available_date,
     cuisine_type, dietary_tags, allergens, source_type, user_id)
  VALUES (v_row.dish_name, COALESCE(v_row.items, '{}'), v_row.price, 'PLN', v_row.description,
    v_restaurant.id, v_restaurant.name, v_restaurant.address,
    COALESCE(v_restaurant.location, v_row.restaurant_location), v_row.available_date,
    v_row.cuisine_type, COALESCE(v_row.dietary_tags, '{}'), COALESCE(v_row.allergens, '{}'), 'link', auth.uid())
  RETURNING * INTO v_row;
  UPDATE public.lunch_import_items SET offer_id = v_row.id
    WHERE restaurant_id = v_restaurant.id AND source_id = p_source_id
      AND item_key = p_item_key AND available_date = v_row.available_date;
  RETURN jsonb_build_object('created', true, 'offer', to_jsonb(v_row));
END;
$$;
REVOKE ALL ON FUNCTION public.create_lunch_import_offer(TEXT,TEXT,TIMESTAMPTZ,TEXT,TEXT,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_lunch_import_offer(TEXT,TEXT,TIMESTAMPTZ,TEXT,TEXT,JSONB) TO authenticated;
