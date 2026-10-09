-- #129: one stable generic HTML source per Restaurant; retries survive URL edits.
ALTER TABLE public.lunch_import_bindings DROP CONSTRAINT lunch_import_bindings_source_id_check;
ALTER TABLE public.lunch_import_bindings ADD CONSTRAINT lunch_import_bindings_source_id_check
 CHECK (source_id IN ('sofa','sushi') OR source_id = 'html-' || restaurant_id::text);
ALTER TABLE public.lunch_import_bindings ADD COLUMN trial JSONB;
ALTER TABLE public.lunch_import_bindings ADD CONSTRAINT import_trial_shape CHECK (
 trial IS NULL OR COALESCE((jsonb_typeof(trial)='object'
   AND jsonb_typeof(trial->'supported')='boolean' AND jsonb_typeof(trial->'fetchedAt')='string'
   AND jsonb_typeof(trial->'excerpt')='string' AND length(trial->>'excerpt') <= 12000
   AND jsonb_typeof(trial->'identityEvidence')='string' AND length(trial->>'identityEvidence') <= 4000
   AND jsonb_typeof(trial->'finalUrl')='string' AND (trial->>'finalUrl') ~ '^https://'
   AND jsonb_typeof(trial->'dishes')='array' AND jsonb_typeof(trial->'limitations')='array'
   AND NOT jsonb_path_exists(trial, '$.limitations[*] ? (@.type() != "string")')
   AND NOT jsonb_path_exists(trial, '$.dishes[*] ? (@.type() != "object" || !exists(@.name) || @.name.type() != "string" || !exists(@.price) || (@.price.type() != "number" && @.price.type() != "null"))')
   AND length(trial::text) <= 100000), false));
ALTER TABLE public.lunch_import_items DROP CONSTRAINT lunch_import_items_source_id_check;
ALTER TABLE public.lunch_import_items ADD CONSTRAINT lunch_import_items_source_id_check
 CHECK (source_id IN ('sofa','sushi') OR source_id = 'html-' || restaurant_id::text);
ALTER TABLE public.lunch_import_bindings ADD CONSTRAINT generic_source_url_check CHECK (
 source_id NOT LIKE 'html-%' OR (length(source_url) <= 2000 AND source_url ~ '^https://[^/@:#?]+\.[^/@:#?]+(/|$)' AND source_url !~ '[#[:space:]]'));

-- Keep fixed catalog immutable in behavior; generic definitions come from current binding.
CREATE OR REPLACE FUNCTION public.import_source_definition(source TEXT) RETURNS JSONB
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
 SELECT CASE source
 WHEN 'sofa' THEN jsonb_build_object('name','Sofa Lounge & Restaurant','address','al. Paderewskiego 35, Wrocław','url','https://www.sofa.wroclaw.pl/restauracja/sofa-lounge-restaurant')
 WHEN 'sushi' THEN jsonb_build_object('name','Sushi Friends Bar & Resto','address','ul. Marco Polo 9e, Wrocław','url','https://sushifriendswroclaw.pl/')
 ELSE (SELECT jsonb_build_object('name',source_name,'address',source_address,'url',source_url)
       FROM public.lunch_import_bindings WHERE source_id = source AND source_id LIKE 'html-%') END;
$$;

CREATE OR REPLACE FUNCTION public.stamp_import_binding() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE r public.restaurants; definition JSONB;
BEGIN
  NEW.revision := gen_random_uuid();
  IF TG_OP = 'UPDATE' AND (OLD.source_id IS DISTINCT FROM NEW.source_id OR OLD.restaurant_id IS DISTINCT FROM NEW.restaurant_id) THEN
    RAISE EXCEPTION 'Source identity cannot change';
  END IF;
  -- Account deletion disables first, even if its old trial has expired.
  IF TG_OP = 'UPDATE' AND OLD.verified_by IS NOT NULL AND NEW.verified_by IS NULL THEN
    NEW.enabled := false;
  END IF;
  IF NEW.source_id LIKE 'html-%' THEN
    IF NEW.source_id <> 'html-' || NEW.restaurant_id::text THEN RAISE EXCEPTION 'Source identity must remain anchored to Restaurant'; END IF;
    IF TG_OP = 'UPDATE' THEN
      IF OLD.source_url IS DISTINCT FROM NEW.source_url OR OLD.source_name IS DISTINCT FROM NEW.source_name
        OR OLD.source_address IS DISTINCT FROM NEW.source_address THEN
        NEW.enabled := false; NEW.trial := NULL; NEW.verified_at := NULL; NEW.verified_by := NULL;
      END IF;
    END IF;
    IF NEW.enabled AND (NEW.trial IS NULL OR NEW.trial->>'supported' IS DISTINCT FROM 'true'
      OR NEW.trial->>'fetchedAt' IS NULL
      OR jsonb_array_length(NEW.trial->'limitations') <> 0
      OR jsonb_array_length(NEW.trial->'dishes') NOT BETWEEN 1 AND 50
      OR (NEW.trial->>'fetchedAt')::timestamptz < now() - interval '30 minutes'
      OR (NEW.trial->>'fetchedAt')::timestamptz > now() + interval '1 minute') THEN
      RAISE EXCEPTION 'Fresh supported trial required';
    END IF;
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

CREATE FUNCTION public.configure_generic_import_source(
 p_restaurant_id UUID, p_revision UUID, p_action TEXT, p_expected_name TEXT, p_expected_address TEXT,
 p_url TEXT, p_trial JSONB, p_evidence TEXT, p_confirmed BOOLEAN
) RETURNS public.lunch_import_bindings LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE r public.restaurants; b public.lunch_import_bindings; sid TEXT;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.restaurants WHERE id=p_restaurant_id FOR SHARE;
 IF NOT FOUND OR r.name IS DISTINCT FROM p_expected_name OR r.address IS DISTINCT FROM p_expected_address THEN RAISE EXCEPTION 'Restaurant changed'; END IF;
 sid := 'html-' || r.id::text;
 -- Serialize first creation as well as updates without reassigning stable sources.
 PERFORM pg_advisory_xact_lock(hashtextextended(sid, 0));
 SELECT * INTO b FROM public.lunch_import_bindings WHERE source_id=sid FOR UPDATE;
 IF b.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Source changed'; END IF;
 IF p_action = 'draft' THEN
   IF p_url IS NULL THEN RAISE EXCEPTION 'URL required'; END IF;
   IF b.source_id IS NULL THEN
     INSERT INTO public.lunch_import_bindings(source_id,restaurant_id,verified_name,verified_address,
       source_url,source_name,source_address,verification_note)
       VALUES(sid,r.id,r.name,r.address,p_url,r.name,r.address,'Unverified HTML draft') RETURNING * INTO b;
   ELSE
     UPDATE public.lunch_import_bindings SET source_url=p_url,source_name=r.name,source_address=r.address,
       enabled=false,trial=NULL,verified_at=NULL,verified_by=NULL WHERE source_id=sid RETURNING * INTO b;
   END IF;
 ELSIF p_action='trial' THEN
   IF public.normalize_import_identity(b.source_name) IS DISTINCT FROM public.normalize_import_identity(r.name)
     OR public.normalize_import_identity(b.source_address) IS DISTINCT FROM public.normalize_import_identity(r.address) THEN
     RAISE EXCEPTION 'Save draft again after Restaurant identity changes';
   END IF;
   IF b.source_id IS NULL OR p_trial IS NULL OR jsonb_typeof(p_trial->'dishes') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_trial->'limitations') IS DISTINCT FROM 'array' OR length(p_trial::text)>100000 THEN RAISE EXCEPTION 'Invalid trial'; END IF;
   UPDATE public.lunch_import_bindings SET enabled=false,trial=p_trial,verified_at=NULL,verified_by=NULL
     WHERE source_id=sid RETURNING * INTO b;
 ELSIF p_action='confirm' THEN
   IF p_confirmed IS DISTINCT FROM true OR length(btrim(p_evidence)) NOT BETWEEN 10 AND 1000 OR p_evidence IS NULL THEN RAISE EXCEPTION 'Explicit branch/freshness evidence required'; END IF;
   IF b.trial IS NULL OR b.trial->>'supported' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Supported trial required'; END IF;
   UPDATE public.lunch_import_bindings SET enabled=true,verification_note=btrim(p_evidence)
     WHERE source_id=sid RETURNING * INTO b;
 ELSIF p_action='disable' THEN
   UPDATE public.lunch_import_bindings SET enabled=false,trial=NULL WHERE source_id=sid RETURNING * INTO b;
 ELSE RAISE EXCEPTION 'Unsupported action'; END IF;
 IF b.source_id IS NULL THEN RAISE EXCEPTION 'Source missing'; END IF;
 RETURN b;
END;
$$;
REVOKE ALL ON FUNCTION public.configure_generic_import_source(UUID,UUID,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT,BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.configure_generic_import_source(UUID,UUID,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT,BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.invalidate_restaurant_import_binding() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.normalize_import_identity(OLD.name) IS DISTINCT FROM public.normalize_import_identity(NEW.name)
    OR public.normalize_import_identity(OLD.address) IS DISTINCT FROM public.normalize_import_identity(NEW.address) THEN
    UPDATE public.lunch_import_bindings SET enabled = false, trial = NULL WHERE restaurant_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
