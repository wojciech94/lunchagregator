-- #128: fixed HTML sources are configured and explicitly verified per branch.
CREATE FUNCTION public.normalize_import_identity(value TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT SET search_path = public, pg_temp AS $$
  SELECT btrim(regexp_replace(
    translate(regexp_replace(btrim(lower(normalize(value, NFKC))),
      '^(ulica|ul|aleja|al)\.?\s+', ''), '.,', '  '), '\s+', ' ', 'g'));
$$;

-- Fixed official URLs/adapters only. Changing this catalog requires a migration.
CREATE FUNCTION public.import_source_definition(source TEXT) RETURNS JSONB
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE source
    WHEN 'sofa' THEN jsonb_build_object('name', 'Sofa Lounge & Restaurant',
      'address', 'al. Paderewskiego 35, Wrocław',
      'url', 'https://www.sofa.wroclaw.pl/restauracja/sofa-lounge-restaurant')
    WHEN 'sushi' THEN jsonb_build_object('name', 'Sushi Friends Bar & Resto',
      'address', 'ul. Marco Polo 9e, Wrocław', 'url', 'https://sushifriendswroclaw.pl/') END;
$$;

CREATE TABLE public.lunch_import_bindings (
  source_id TEXT PRIMARY KEY CHECK (source_id IN ('sofa', 'sushi')),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  revision UUID NOT NULL DEFAULT gen_random_uuid(),
  verified_name TEXT NOT NULL,
  verified_address TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_address TEXT NOT NULL,
  verification_note TEXT NOT NULL CHECK (length(btrim(verification_note)) BETWEEN 10 AND 1000),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.lunch_import_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage verified import bindings" ON public.lunch_import_bindings
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON public.lunch_import_bindings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lunch_import_bindings TO authenticated;
GRANT ALL ON public.lunch_import_bindings TO service_role;

-- Generate freshness generations even for direct Admin writes. Verification
-- snapshots and actor/time are database-authoritative, not request metadata.
CREATE FUNCTION public.stamp_import_binding() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE r public.restaurants; definition JSONB;
BEGIN
  NEW.revision := gen_random_uuid();
  -- ON DELETE SET NULL of the confirming user must invalidate verification,
  -- rather than prevent account deletion or re-stamp it as another Admin.
  IF TG_OP = 'UPDATE' AND OLD.verified_by IS NOT NULL AND NEW.verified_by IS NULL THEN
    NEW.enabled := false;
  END IF;
  IF NEW.enabled THEN
    IF auth.uid() IS NULL OR NOT public.is_admin() THEN
      RAISE EXCEPTION 'Admin verification required' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO r FROM public.restaurants WHERE id = NEW.restaurant_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Restaurant missing'; END IF;
    definition := public.import_source_definition(NEW.source_id);
    IF definition IS NULL THEN RAISE EXCEPTION 'Unsupported source'; END IF;
    NEW.verified_name := r.name; NEW.verified_address := r.address;
    NEW.source_url := definition->>'url'; NEW.source_name := definition->>'name';
    NEW.source_address := definition->>'address';
    NEW.verified_by := auth.uid(); NEW.verified_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER stamp_import_binding BEFORE INSERT OR UPDATE ON public.lunch_import_bindings
FOR EACH ROW EXECUTE FUNCTION public.stamp_import_binding();

-- Owners may edit Restaurants, but may not re-verify import sources. Only
-- formatting-equivalent edits preserve verification. Reverting a meaningful
-- edit must not silently reactivate a binding.
CREATE FUNCTION public.invalidate_restaurant_import_binding() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.normalize_import_identity(OLD.name) IS DISTINCT FROM public.normalize_import_identity(NEW.name)
    OR public.normalize_import_identity(OLD.address) IS DISTINCT FROM public.normalize_import_identity(NEW.address) THEN
    UPDATE public.lunch_import_bindings SET enabled = false WHERE restaurant_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.invalidate_restaurant_import_binding() FROM PUBLIC;
CREATE TRIGGER invalidate_restaurant_import_binding AFTER UPDATE OF name, address ON public.restaurants
FOR EACH ROW EXECUTE FUNCTION public.invalidate_restaurant_import_binding();

CREATE FUNCTION public.configure_lunch_import_binding(
  p_restaurant_id UUID, p_source_id TEXT, p_action TEXT, p_revision UUID,
  p_expected_name TEXT, p_expected_address TEXT, p_evidence TEXT, p_confirmed BOOLEAN
) RETURNS public.lunch_import_bindings LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE r public.restaurants; b public.lunch_import_bindings; definition JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.restaurants WHERE id = p_restaurant_id FOR SHARE;
  IF NOT FOUND OR r.name IS DISTINCT FROM p_expected_name OR r.address IS DISTINCT FROM p_expected_address THEN
    RAISE EXCEPTION 'Restaurant changed; reload before confirming';
  END IF;
  definition := public.import_source_definition(p_source_id);
  IF definition IS NULL THEN RAISE EXCEPTION 'Unsupported source'; END IF;
  SELECT * INTO b FROM public.lunch_import_bindings WHERE source_id = p_source_id FOR UPDATE;
  IF FOUND AND (b.restaurant_id <> p_restaurant_id OR b.revision IS DISTINCT FROM p_revision) THEN
    RAISE EXCEPTION 'Source already bound elsewhere or configuration changed';
  END IF;
  IF NOT FOUND AND p_revision IS NOT NULL THEN RAISE EXCEPTION 'Configuration changed'; END IF;
  IF p_action = 'disable' THEN
    UPDATE public.lunch_import_bindings SET enabled = false
      WHERE source_id = p_source_id AND restaurant_id = p_restaurant_id RETURNING * INTO b;
    IF NOT FOUND THEN RAISE EXCEPTION 'Binding missing'; END IF;
    RETURN b;
  END IF;
  IF p_action <> 'confirm' OR p_action IS NULL OR p_confirmed IS DISTINCT FROM true
    OR p_evidence IS NULL OR length(btrim(p_evidence)) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Explicit branch confirmation and evidence required';
  END IF;
  IF b.source_id IS NULL THEN
    INSERT INTO public.lunch_import_bindings(source_id, restaurant_id, enabled,
      verified_name, verified_address, source_url, source_name, source_address, verification_note)
      VALUES (p_source_id, r.id, true, r.name, r.address, definition->>'url',
        definition->>'name', definition->>'address', btrim(p_evidence)) RETURNING * INTO b;
  ELSE
    UPDATE public.lunch_import_bindings SET enabled = true, verification_note = btrim(p_evidence)
      WHERE source_id = p_source_id RETURNING * INTO b;
  END IF;
  RETURN b;
END;
$$;
REVOKE ALL ON FUNCTION public.configure_lunch_import_binding(UUID,TEXT,TEXT,UUID,TEXT,TEXT,TEXT,BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.configure_lunch_import_binding(UUID,TEXT,TEXT,UUID,TEXT,TEXT,TEXT,BOOLEAN) TO authenticated;

-- Remove the legacy signature: old clients cannot omit the binding generation.
DROP FUNCTION public.create_lunch_import_offer(TEXT,TEXT,TIMESTAMPTZ,TEXT,TEXT,JSONB);

CREATE FUNCTION public.create_lunch_import_offer(
  p_source_id TEXT, p_item_key TEXT, p_fetched_at TIMESTAMPTZ,
  p_expected_name TEXT, p_expected_address TEXT, p_binding_revision UUID, p_offer JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE
  v_row public.lunch_offers;
  v_restaurant public.restaurants;
  v_claim UUID;
  v_existing UUID;
  v_url TEXT;
  v_binding public.lunch_import_bindings;
  v_definition JSONB;
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
  SELECT * INTO v_binding FROM public.lunch_import_bindings
    WHERE source_id = p_source_id AND restaurant_id = v_restaurant.id FOR SHARE;
  v_definition := public.import_source_definition(p_source_id);
  IF NOT FOUND OR NOT v_binding.enabled OR v_binding.verified_by IS NULL
    OR v_binding.verified_at IS NULL OR v_binding.revision IS DISTINCT FROM p_binding_revision
    OR public.normalize_import_identity(v_binding.verified_name) IS DISTINCT FROM public.normalize_import_identity(v_restaurant.name)
    OR public.normalize_import_identity(v_binding.verified_address) IS DISTINCT FROM public.normalize_import_identity(v_restaurant.address)
    OR v_binding.source_url IS DISTINCT FROM v_definition->>'url'
    OR v_binding.source_name IS DISTINCT FROM v_definition->>'name'
    OR v_binding.source_address IS DISTINCT FROM v_definition->>'address' THEN
    RAISE EXCEPTION 'Source disabled, unverified or configuration changed';
  END IF;
  IF v_row.available_date IS NULL OR v_row.available_date < CURRENT_DATE
    OR v_row.available_date > CURRENT_DATE + 30 THEN
    RAISE EXCEPTION 'Invalid publication date';
  END IF;
  IF p_fetched_at IS NULL OR p_fetched_at < now() - interval '30 minutes'
    OR p_fetched_at > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'Preview expired';
  END IF;
  v_url := v_binding.source_url;
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
REVOKE ALL ON FUNCTION public.create_lunch_import_offer(TEXT,TEXT,TIMESTAMPTZ,TEXT,TEXT,UUID,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_lunch_import_offer(TEXT,TEXT,TIMESTAMPTZ,TEXT,TEXT,UUID,JSONB) TO authenticated;
