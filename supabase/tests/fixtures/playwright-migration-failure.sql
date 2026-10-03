-- Apply this fixture only to the disposable Supabase project used by
-- __tests__/e2e/post-auth-migration.spec.ts. Do not include it in production
-- migrations. It causes an error only for the suite's unique failure tokens,
-- allowing the browser test to verify that login remains successful and the
-- migration warning is displayed after a real RPC error.

CREATE OR REPLACE FUNCTION public.fail_playwright_migration_for_test_token()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.session_token LIKE 'playwright-migration-failure-%' THEN
    RAISE EXCEPTION 'Playwright migration failure fixture';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS playwright_migration_failure_fixture ON public.restaurants;

CREATE TRIGGER playwright_migration_failure_fixture
BEFORE UPDATE OF user_id ON public.restaurants
FOR EACH ROW
EXECUTE FUNCTION public.fail_playwright_migration_for_test_token();
