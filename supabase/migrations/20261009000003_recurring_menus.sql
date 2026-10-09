-- #139 supersedes the manual-only weekly flag for explicitly activated schedules.
-- One transactional module owns publication, exceptions and materialization.
CREATE TABLE public.menu_schedules (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  reconciled_at timestamptz
);

CREATE FUNCTION public.valid_menu_dishes(dishes jsonb, with_days boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE d jsonb; day jsonb; seen uuid[] := '{}'; ident uuid;
BEGIN
  IF dishes IS NULL OR jsonb_typeof(dishes) <> 'array' OR jsonb_array_length(dishes) NOT BETWEEN 1 AND 100 THEN RETURN false; END IF;
  FOR d IN SELECT value FROM jsonb_array_elements(dishes) LOOP
    ident := (d->>'id')::uuid;
    IF ident IS NULL OR ident = ANY(seen) THEN RETURN false; END IF;
    seen := array_append(seen, ident);
    IF jsonb_typeof(d->'dishName') <> 'string' OR length(trim(d->>'dishName')) NOT BETWEEN 1 AND 100
      OR jsonb_typeof(d->'price') <> 'number' OR (d->>'price')::numeric NOT BETWEEN 0.01 AND 9999.99
      OR coalesce(d->>'sourceType', '') NOT IN ('link','text','photo')
      OR coalesce(length(d->>'description'), 0) > 500 THEN RETURN false; END IF;
    IF NOT (d ?& ARRAY['id','dishName','price','sourceType','items','dietaryTags','allergens','description','cuisineType']) THEN RETURN false; END IF;
    IF jsonb_typeof(d->'description') NOT IN ('string','null') OR jsonb_typeof(d->'cuisineType') NOT IN ('string','null') THEN RETURN false; END IF;
    IF d->>'cuisineType' IS NOT NULL AND d->>'cuisineType' NOT IN ('polska','wloska','azjatycka','meksykanska','amerykanska','indyjska','srodziemnomorska','inne') THEN RETURN false; END IF;
    IF jsonb_typeof(d->'items') <> 'array' OR jsonb_array_length(d->'items') > 10
      OR jsonb_typeof(d->'dietaryTags') <> 'array' OR jsonb_array_length(d->'dietaryTags') > 5
      OR jsonb_typeof(d->'allergens') <> 'array' OR jsonb_array_length(d->'allergens') > 10 THEN RETURN false; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(d->'items') x WHERE jsonb_typeof(x) <> 'string' OR length(x #>> '{}') > 200)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(d->'dietaryTags') x WHERE jsonb_typeof(x) <> 'string')
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(d->'allergens') x WHERE jsonb_typeof(x) <> 'string')
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(d->'dietaryTags') x WHERE x NOT IN ('vegetarian','vegan','gluten-free','dairy-free','keto'))
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(d->'allergens') x WHERE x NOT IN ('gluten','orzechy','mleko','jaja','ryby','skorupiaki','soja','seler','gorczyca','sezam')) THEN RETURN false; END IF;
    IF with_days THEN
      IF NOT (d ? 'days') OR jsonb_typeof(d->'days') <> 'array' OR jsonb_array_length(d->'days') NOT BETWEEN 1 AND 7 THEN RETURN false; END IF;
      FOR day IN SELECT value FROM jsonb_array_elements(d->'days') LOOP
        IF jsonb_typeof(day) <> 'number' OR day::text NOT IN ('1','2','3','4','5','6','7') THEN RETURN false; END IF;
      END LOOP;
      IF (SELECT count(DISTINCT x) FROM jsonb_array_elements(d->'days') x) <> jsonb_array_length(d->'days') THEN RETURN false; END IF;
    END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

CREATE FUNCTION public.valid_menu_content(content jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp AS $$
  SELECT coalesce(content->>'kind', '') IN ('fixed','weekday') AND public.valid_menu_dishes(content->'entries', true)
    AND (content->>'kind' <> 'fixed' OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(content->'entries') x
      WHERE x->'days' <> content->'entries'->0->'days'
    ));
$$;

CREATE TABLE public.menu_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.menu_schedules(restaurant_id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  content jsonb NOT NULL CHECK (public.valid_menu_content(content)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, effective_from)
);
CREATE TABLE public.menu_exceptions (
  restaurant_id uuid NOT NULL REFERENCES public.menu_schedules(restaurant_id) ON DELETE CASCADE,
  date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('closed','replacement')),
  dishes jsonb,
  CHECK ((kind = 'closed' AND dishes IS NULL) OR (kind = 'replacement' AND public.valid_menu_dishes(dishes))),
  PRIMARY KEY (restaurant_id, date)
);

ALTER TABLE public.lunch_offers ADD COLUMN menu_entry_id uuid,
  ADD COLUMN menu_revision_id uuid,
  ADD COLUMN menu_exception boolean NOT NULL DEFAULT false,
  ADD COLUMN withdrawn boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX menu_occurrence_identity ON public.lunch_offers(restaurant_id, menu_entry_id, available_date);
CREATE INDEX menu_exception_date ON public.menu_exceptions(date);

CREATE FUNCTION public.can_manage_menu(rid uuid) RETURNS boolean LANGUAGE sql STABLE
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.restaurants WHERE id = rid AND (user_id = auth.uid() OR public.is_admin()));
$$;
ALTER TABLE public.menu_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public menu status" ON public.menu_schedules FOR SELECT USING (true);
CREATE POLICY "insert menu status" ON public.menu_schedules FOR INSERT WITH CHECK (public.can_manage_menu(restaurant_id));
CREATE POLICY "update menu status" ON public.menu_schedules FOR UPDATE USING (public.can_manage_menu(restaurant_id)) WITH CHECK (public.can_manage_menu(restaurant_id));
CREATE POLICY "manage menu revisions" ON public.menu_revisions FOR ALL USING (public.can_manage_menu(restaurant_id)) WITH CHECK (public.can_manage_menu(restaurant_id));
CREATE POLICY "public menu exceptions" ON public.menu_exceptions FOR SELECT USING (true);
CREATE POLICY "manage menu exceptions" ON public.menu_exceptions FOR ALL USING (public.can_manage_menu(restaurant_id)) WITH CHECK (public.can_manage_menu(restaurant_id));

-- A security-invoker view shares the rule across every public listing/detail/count.
CREATE VIEW public.visible_lunch_offers WITH (security_invoker = true) AS
SELECT lo.* FROM public.lunch_offers lo WHERE NOT lo.withdrawn AND NOT EXISTS (
  SELECT 1 FROM public.menu_exceptions e WHERE e.restaurant_id = lo.restaurant_id AND e.date = lo.available_date
    AND (e.kind = 'closed' OR (e.kind = 'replacement' AND NOT lo.menu_exception))
);
GRANT SELECT ON public.visible_lunch_offers TO anon, authenticated, service_role;

-- Occurrences cannot be edited individually; the module owns their lifecycle.
DROP POLICY "owners and admins can modify lunch_offers" ON public.lunch_offers;
CREATE POLICY "insert independent offers" ON public.lunch_offers FOR INSERT WITH CHECK (
  (auth.uid() = user_id OR public.is_admin()) AND menu_entry_id IS NULL AND NOT menu_exception AND NOT withdrawn
);
CREATE POLICY "update independent offers" ON public.lunch_offers FOR UPDATE
USING ((auth.uid() = user_id OR public.is_admin()) AND menu_entry_id IS NULL)
WITH CHECK ((auth.uid() = user_id OR public.is_admin()) AND menu_entry_id IS NULL AND NOT menu_exception);
CREATE POLICY "delete independent offers" ON public.lunch_offers FOR DELETE
USING ((auth.uid() = user_id OR public.is_admin()) AND menu_entry_id IS NULL);

CREATE FUNCTION public.reconcile_menu(rid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE r public.restaurants; s public.menu_schedules; rev public.menu_revisions; e public.menu_exceptions;
  today date := (now() AT TIME ZONE 'Europe/Warsaw')::date;
  target date; dishes jsonb; dish jsonb; occurrence uuid; keep uuid[] := '{}'; exceptional boolean;
BEGIN
  -- Every writer (including triggers and runner) acquires this same lock BEFORE
  -- reading a revision. Read committed then sees the latest committed schedule.
  SELECT * INTO r FROM public.restaurants WHERE id = rid FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO s FROM public.menu_schedules WHERE restaurant_id = rid;
  IF NOT FOUND THEN RETURN; END IF;
  FOR n IN 0..29 LOOP
    target := today + n;
    SELECT * INTO e FROM public.menu_exceptions WHERE restaurant_id = rid AND date = target;
    exceptional := FOUND AND e.kind = 'replacement';
    dishes := '[]';
    rev := NULL;
    IF exceptional THEN dishes := e.dishes;
    ELSIF e.kind IS DISTINCT FROM 'closed' AND s.active THEN
      SELECT * INTO rev FROM public.menu_revisions WHERE restaurant_id = rid AND effective_from <= target ORDER BY effective_from DESC LIMIT 1;
      SELECT coalesce(jsonb_agg(value), '[]') INTO dishes FROM jsonb_array_elements(coalesce(rev.content->'entries', '[]'))
        WHERE (value->'days') @> to_jsonb(ARRAY[extract(isodow FROM target)::integer]);
    END IF;
    FOR dish IN SELECT value FROM jsonb_array_elements(dishes) LOOP
      INSERT INTO public.lunch_offers (restaurant_id, menu_entry_id, menu_revision_id, menu_exception, withdrawn,
        dish_name, price, items, description, cuisine_type, dietary_tags, allergens, source_type,
        restaurant_name, restaurant_address, restaurant_location, available_date, user_id)
      VALUES (rid, (dish->>'id')::uuid, rev.id, exceptional, false,
        dish->>'dishName', (dish->>'price')::numeric, ARRAY(SELECT jsonb_array_elements_text(dish->'items')),
        dish->>'description', dish->>'cuisineType', ARRAY(SELECT jsonb_array_elements_text(dish->'dietaryTags')),
        ARRAY(SELECT jsonb_array_elements_text(dish->'allergens')), dish->>'sourceType',
        r.name, r.address, r.location, target, r.user_id)
      ON CONFLICT (restaurant_id, menu_entry_id, available_date) DO UPDATE SET
        dish_name = EXCLUDED.dish_name, price = EXCLUDED.price, items = EXCLUDED.items, description = EXCLUDED.description,
        cuisine_type = EXCLUDED.cuisine_type, dietary_tags = EXCLUDED.dietary_tags, allergens = EXCLUDED.allergens,
        source_type = EXCLUDED.source_type, menu_revision_id = EXCLUDED.menu_revision_id,
        menu_exception = EXCLUDED.menu_exception, withdrawn = false,
        updated_at = CASE WHEN lunch_offers.menu_revision_id IS DISTINCT FROM EXCLUDED.menu_revision_id OR lunch_offers.withdrawn THEN now() ELSE lunch_offers.updated_at END
      RETURNING id INTO occurrence;
      keep := array_append(keep, occurrence);
    END LOOP;
  END LOOP;
  UPDATE public.lunch_offers SET withdrawn = true WHERE restaurant_id = rid AND menu_entry_id IS NOT NULL
    AND available_date >= today AND NOT (id = ANY(keep)) AND NOT withdrawn;
  UPDATE public.menu_schedules SET reconciled_at = now() WHERE restaurant_id = rid;
  DELETE FROM public.menu_generation_failures WHERE restaurant_id = rid;
END $$;
REVOKE ALL ON FUNCTION public.reconcile_menu(uuid) FROM PUBLIC, anon, authenticated;

-- Locks must precede the write, not merely follow it in an AFTER trigger.
CREATE FUNCTION public.lock_menu_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE rid uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.restaurant_id ELSE NEW.restaurant_id END;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.restaurant_id <> OLD.restaurant_id THEN RAISE EXCEPTION 'A menu cannot change restaurant'; END IF;
  PERFORM 1 FROM public.restaurants WHERE id = rid FOR UPDATE;
  IF NOT FOUND THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_TABLE_NAME IN ('menu_revisions','menu_exceptions') THEN
    IF TG_OP <> 'DELETE' AND coalesce(to_jsonb(NEW)->>'effective_from', to_jsonb(NEW)->>'date')::date < (now() AT TIME ZONE 'Europe/Warsaw')::date THEN
      RAISE EXCEPTION 'Past menus are immutable';
    END IF;
    IF TG_OP IN ('DELETE','UPDATE') AND coalesce(to_jsonb(OLD)->>'effective_from', to_jsonb(OLD)->>'date')::date < (now() AT TIME ZONE 'Europe/Warsaw')::date THEN
      RAISE EXCEPTION 'Past menus are immutable';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE FUNCTION public.after_menu_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.reconcile_menu(CASE WHEN TG_OP = 'DELETE' THEN OLD.restaurant_id ELSE NEW.restaurant_id END);
  RETURN NULL;
END $$;
CREATE TRIGGER lock_menu_revision BEFORE INSERT OR UPDATE OR DELETE ON public.menu_revisions FOR EACH ROW EXECUTE FUNCTION public.lock_menu_write();
CREATE TRIGGER reconcile_menu_revision AFTER INSERT OR UPDATE OR DELETE ON public.menu_revisions FOR EACH ROW EXECUTE FUNCTION public.after_menu_write();
CREATE TRIGGER lock_menu_exception BEFORE INSERT OR UPDATE OR DELETE ON public.menu_exceptions FOR EACH ROW EXECUTE FUNCTION public.lock_menu_write();
CREATE TRIGGER reconcile_menu_exception AFTER INSERT OR UPDATE OR DELETE ON public.menu_exceptions FOR EACH ROW EXECUTE FUNCTION public.after_menu_write();
CREATE TRIGGER lock_menu_status BEFORE INSERT OR UPDATE OF active ON public.menu_schedules FOR EACH ROW EXECUTE FUNCTION public.lock_menu_write();
CREATE TRIGGER reconcile_menu_status AFTER UPDATE OF active ON public.menu_schedules FOR EACH ROW EXECUTE FUNCTION public.after_menu_write();

-- Security INVOKER: RLS is a second check independent of the server action.
CREATE FUNCTION public.publish_recurring_menu(rid uuid, effective date, menu jsonb, replace_ids uuid[] DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_menu(rid) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.restaurants WHERE id = rid FOR UPDATE;
  IF effective < (now() AT TIME ZONE 'Europe/Warsaw')::date OR effective > (now() AT TIME ZONE 'Europe/Warsaw')::date + 29 THEN RAISE EXCEPTION 'Invalid effective date'; END IF;
  IF menu->>'kind' = 'fixed' AND EXISTS (SELECT 1 FROM jsonb_array_elements(menu->'entries') x WHERE x->'days' <> menu->'entries'->0->'days') THEN RAISE EXCEPTION 'Fixed menu weekdays must match'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(replace_ids) ident WHERE NOT EXISTS (
    SELECT 1 FROM public.lunch_offers WHERE id = ident AND restaurant_id = rid AND (user_id = auth.uid() OR public.is_admin()) AND menu_entry_id IS NULL
  )) THEN RAISE EXCEPTION 'Invalid source offer selection'; END IF;
  -- Explicitly selected independent source rows are withdrawn only when future;
  -- they are never silently adopted as generated occurrences.
  UPDATE public.lunch_offers SET withdrawn = true WHERE id = ANY(replace_ids) AND available_date >= effective;
  INSERT INTO public.menu_schedules(restaurant_id) VALUES(rid) ON CONFLICT (restaurant_id) DO UPDATE SET active = true, updated_at = now();
  INSERT INTO public.menu_revisions(restaurant_id, effective_from, content) VALUES(rid, effective, menu)
  ON CONFLICT (restaurant_id, effective_from) DO UPDATE SET content = EXCLUDED.content, id = gen_random_uuid(), created_at = now();
END $$;
REVOKE ALL ON FUNCTION public.publish_recurring_menu(uuid,date,jsonb,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_recurring_menu(uuid,date,jsonb,uuid[]) TO authenticated;

-- Derive the legacy marker after explicit activation; legacy rows without a
-- schedule retain their pending-setup flag. It is no longer a writable status.
CREATE FUNCTION public.derive_menu_flag() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  SELECT active INTO NEW.menu_recurs_weekly FROM public.menu_schedules WHERE restaurant_id = NEW.id;
  IF NOT FOUND THEN NEW.menu_recurs_weekly := OLD.menu_recurs_weekly; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER derive_menu_flag BEFORE UPDATE OF menu_recurs_weekly ON public.restaurants FOR EACH ROW EXECUTE FUNCTION public.derive_menu_flag();

CREATE FUNCTION public.sync_menu_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.restaurants SET menu_recurs_weekly = NEW.active WHERE id = NEW.restaurant_id;
  RETURN NULL;
END $$;
CREATE TRIGGER sync_menu_status AFTER INSERT OR UPDATE OF active ON public.menu_schedules FOR EACH ROW EXECUTE FUNCTION public.sync_menu_status();

CREATE FUNCTION public.change_recurring_menu(rid uuid, command text, payload jsonb DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE target date := (payload->>'date')::date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_menu(rid) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.restaurants WHERE id = rid FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.menu_schedules WHERE restaurant_id = rid) THEN RAISE EXCEPTION 'Menu not configured'; END IF;
  IF command = 'stop' OR command = 'resume' THEN
    UPDATE public.menu_schedules SET active = (command = 'resume'), updated_at = now() WHERE restaurant_id = rid;
  ELSIF command = 'exception' THEN
    IF target IS NULL OR target < (now() AT TIME ZONE 'Europe/Warsaw')::date OR target > (now() AT TIME ZONE 'Europe/Warsaw')::date + 29 THEN RAISE EXCEPTION 'Invalid exception date'; END IF;
    IF payload->>'kind' = 'remove' THEN
      DELETE FROM public.menu_exceptions WHERE restaurant_id = rid AND date = target;
    ELSE
      INSERT INTO public.menu_exceptions(restaurant_id,date,kind,dishes) VALUES(rid,target,payload->>'kind',payload->'dishes')
      ON CONFLICT (restaurant_id,date) DO UPDATE SET kind = EXCLUDED.kind, dishes = EXCLUDED.dishes;
    END IF;
    UPDATE public.menu_schedules SET updated_at = now() WHERE restaurant_id = rid;
  ELSE RAISE EXCEPTION 'Invalid menu command'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.change_recurring_menu(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_recurring_menu(uuid,text,jsonb) TO authenticated;

-- Persistent pg_cron runner: installed with the migration, not a dev timer or
-- an app-owned chat task. Each restaurant is reconciled atomically; failures
-- don't prevent the remaining bounded batch from progressing.
CREATE TABLE public.menu_generation_failures (restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE, failed_at timestamptz NOT NULL DEFAULT now(), message text NOT NULL);
ALTER TABLE public.menu_generation_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner generation failures" ON public.menu_generation_failures FOR SELECT USING (public.can_manage_menu(restaurant_id));
CREATE FUNCTION public.run_recurring_menus() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE rid uuid; processed integer := 0;
BEGIN
  FOR rid IN SELECT restaurant_id FROM public.menu_schedules WHERE active AND (reconciled_at IS NULL OR reconciled_at < now() - interval '20 hours') ORDER BY reconciled_at NULLS FIRST LIMIT 100 LOOP
    BEGIN
      PERFORM public.reconcile_menu(rid);
      DELETE FROM public.menu_generation_failures WHERE restaurant_id = rid;
      processed := processed + 1;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.menu_generation_failures(restaurant_id, message) VALUES(rid, SQLSTATE)
      ON CONFLICT (restaurant_id) DO UPDATE SET failed_at = now(), message = EXCLUDED.message;
    END;
  END LOOP;
  RETURN processed;
END $$;
REVOKE ALL ON FUNCTION public.run_recurring_menus() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_recurring_menus() TO service_role;
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('recurring-lunch-menus', '17 * * * *', 'SELECT public.run_recurring_menus()');

-- Shared public availability rule.
-- #88 review: default nearest-first ordering must not require a radius filter.
CREATE OR REPLACE FUNCTION get_offers_filtered(
  p_date DATE DEFAULT CURRENT_DATE,
  p_price_min NUMERIC DEFAULT NULL,
  p_price_max NUMERIC DEFAULT NULL,
  p_cuisine_types TEXT[] DEFAULT NULL,
  p_dietary_tags TEXT[] DEFAULT NULL,
  p_search_query TEXT DEFAULT NULL,
  p_user_lat DOUBLE PRECISION DEFAULT NULL,
  p_user_lng DOUBLE PRECISION DEFAULT NULL,
  p_radius_km DOUBLE PRECISION DEFAULT NULL,
  p_sort_by TEXT DEFAULT 'distance',
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
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
  updated_at TIMESTAMPTZ,
  distance_km DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_origin GEOGRAPHY(POINT, 4326);
BEGIN
  IF p_user_lat IS NOT NULL AND p_user_lng IS NOT NULL THEN
    v_origin := ST_SetSRID(ST_MakePoint(p_user_lng, p_user_lat), 4326)::geography;
  END IF;

  -- Origin determines distance; radius only determines which rows are kept.
  -- Without an explicit radius retain distant and unlocated restaurants too.
  RETURN QUERY
  SELECT
    lo.id, lo.dish_name, lo.items, lo.price, lo.currency, lo.description,
    lo.restaurant_id, lo.restaurant_name, lo.restaurant_address,
    lo.restaurant_location, lo.available_date, lo.cuisine_type,
    lo.dietary_tags, lo.allergens, lo.source_type, lo.user_id,
    lo.session_token, lo.created_at, lo.updated_at,
    ROUND((ST_Distance(lo.restaurant_location, v_origin) / 1000.0)::numeric, 1)::double precision
  FROM public.visible_lunch_offers lo
  WHERE lo.available_date = p_date
    AND (v_origin IS NULL OR p_radius_km IS NULL OR
      ST_DWithin(lo.restaurant_location, v_origin, p_radius_km * 1000))
    AND (p_price_min IS NULL OR lo.price >= p_price_min)
    AND (p_price_max IS NULL OR lo.price <= p_price_max)
    AND (p_cuisine_types IS NULL OR lo.cuisine_type = ANY (p_cuisine_types))
    AND (p_dietary_tags IS NULL OR p_dietary_tags <@ lo.dietary_tags)
    AND (p_search_query IS NULL
      OR lo.dish_name ILIKE '%' || p_search_query || '%'
      OR lo.description ILIKE '%' || p_search_query || '%')
  ORDER BY
    CASE WHEN p_sort_by = 'price_asc' THEN lo.price END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'price_desc' THEN lo.price END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'newest' THEN lo.created_at END DESC NULLS LAST,
    -- Sort on unrounded metres; the displayed one-decimal distance can tie.
    CASE WHEN COALESCE(p_sort_by, 'distance') = 'distance'
      THEN ST_Distance(lo.restaurant_location, v_origin) END ASC NULLS LAST,
    lo.restaurant_name ASC,
    lo.id ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION get_offers_filtered IS
  'One filtered, ordered, sliced offer query. Origin enables distance independently of radius; '
  'explicit price/newest ordering takes precedence. Unknown distances sort last.';
