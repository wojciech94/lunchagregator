# Recurring menu deployment and verification

Issue: [#139](https://github.com/wojciech94/lunchagregator/issues/139). Decision: [ADR-0001](../adr/0001-recurring-menu-materialization.md).

## Deployment

Apply `supabase/migrations/20261009000000_recurring_menus.sql` through the normal Supabase migration workflow before deploying the application. It adds schedules, effective revisions, date exceptions, generated-offer provenance and `visible_lunch_offers`. It does not activate existing flagged restaurants or publish a restaurant's menu without owner setup.

The migration enables `pg_cron` and installs `recurring-lunch-menus`, scheduled at minute 17 of every hour. Each invocation processes at most 100 active schedules whose horizon has not been reconciled for 20 hours, oldest first. Thus each unchanged schedule is refreshed approximately daily, with bounded catch-up capacity. No application secret or externally configured HTTP cron is needed. Verify that the deployment's PostgreSQL supports/enables `pg_cron`; a failed extension or scheduling statement must fail the migration, not leave the app silently without automation.

Use these read-only operator checks:

```sql
select jobname, schedule, active from cron.job
where jobname = 'recurring-lunch-menus';
select restaurant_id, active, reconciled_at from public.menu_schedules
where active and (reconciled_at is null or reconciled_at < now() - interval '2 days');
select restaurant_id, failed_at, message from public.menu_generation_failures;
```

Failure records contain SQLSTATE, not menu content or credentials. Successful reconciliation clears the failure. Consult `cron.job_run_details` for scheduler failures, address the underlying database problem and retry with `select public.run_recurring_menus()` as an operator/service role. Normal authenticated/anonymous clients cannot invoke the worker or internal reconciler. Repeated execution is idempotent and preserves occurrence IDs. Monitor a growing stale-schedule backlog; 100 schedules/hour is an explicit first-release capacity, not an unlimited queue.

Each owner command locks its restaurant before reading/changing the schedule. RLS independently checks ownership/admin authorization; server actions also authenticate and check ownership. Reconciliation triggers run inside that transaction. A closure suppresses all offers for a restaurant/date; a replacement supplies the complete menu on that date; removing the exception restores the normal schedule. Stopping withdraws generated current/future offers and preserves independently published replacements, one-off offers and past history.

## Local verification

Start local Supabase as described in [test-database.md](test-database.md). Apply the migration locally without resetting unrelated local fixtures. Obtain `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY` and `TEST_SUPABASE_SERVICE_ROLE_KEY` from `npx supabase status`; keep credentials out of logs.

```text
npm run typecheck
npm test
npm run test:db -- __tests__/db/recurring-menus.test.ts
npx playwright test --config playwright.recurring.config.ts
npm run build
```

The focused E2E config refuses non-local database hosts, launches an isolated Next server on port 3100 and uses `.next-recurring-test` for build output. It forwards the local test URL/key to that server without editing `.env.local`. Tests create unique accounts/restaurants and clean them up; they cover desktop and 320px mobile publication, next-Monday browsing, price editing, closure removal and stopping. Do not run them against a shared deployed database.

The SQL module is the write seam. The pure preview selector is checked against real generated SQL results across the 30-date horizon so weekday behavior cannot silently diverge. A zero-row listing is distinct from a database error.
