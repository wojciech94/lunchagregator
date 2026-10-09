-- Keep source activation history even when verification is superseded or deleted.
ALTER TABLE public.admin_audit_log DROP CONSTRAINT admin_audit_log_action_check;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check
  CHECK (action IN ('insert', 'update', 'delete'));
ALTER TABLE public.admin_audit_log DROP CONSTRAINT admin_audit_log_table_name_check;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_table_name_check
  CHECK (table_name IN ('lunch_offers', 'restaurants', 'lunch_import_bindings'));
-- Match the existing ON DELETE SET NULL contract: account deletion retains history.
ALTER TABLE public.admin_audit_log ALTER COLUMN actor_id DROP NOT NULL;

-- The binding's key is source_id (text). record_id is the related Restaurant UUID;
-- both snapshots carry source_id, revision, evidence and verifier metadata.
-- A trigger covers RPC and direct Admin writes, atomically with the mutation.
CREATE FUNCTION public.audit_import_binding() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.is_admin() THEN
    INSERT INTO public.admin_audit_log(actor_id, action, table_name, record_id, before, after)
    VALUES (auth.uid(), lower(TG_OP), 'lunch_import_bindings',
      CASE WHEN TG_OP = 'DELETE' THEN OLD.restaurant_id ELSE NEW.restaurant_id END,
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
      CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_import_binding() FROM PUBLIC;
CREATE TRIGGER audit_import_binding AFTER INSERT OR UPDATE OR DELETE ON public.lunch_import_bindings
FOR EACH ROW EXECUTE FUNCTION public.audit_import_binding();
