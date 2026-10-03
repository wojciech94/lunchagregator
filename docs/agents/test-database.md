# Test database

There is no documented way to obtain a test database. This file is that way.

## The local stack

```bash
npx supabase start          # boots Postgres 17 + PostGIS 3.3, applies migrations, seeds
npx supabase status         # prints URL and keys
npx supabase stop           # shuts it down
```

Requires Docker Desktop. The daemon is not running by default on this machine —
launch `Docker Desktop.exe` first and wait for it to report a server version.

First run pulls several images and takes a few minutes. Afterwards it is a few
seconds.

| | |
|---|---|
| API / PostgREST | `http://127.0.0.1:54321` |
| Postgres (direct) | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio | `http://127.0.0.1:54323` |
| Mailpit | `http://127.0.0.1:54324` |

Keys are fixed local defaults, but read them from `npx supabase status` rather
than pasting them from here.

To point the app at the local stack, copy the `API_URL`, `ANON_KEY` and
`SERVICE_ROLE_KEY` from `npx supabase status` into `.env.local` as
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and a service-role
key. Be aware that doing so makes `npm run dev` write to a throwaway database.

## PostGIS is not optional

`get_offers_within_radius` uses `ST_DWithin` over a `geography` column. Nothing
about the distance path can be verified without PostGIS, which is the main
reason for using a real Postgres rather than a mock. The local stack ships
PostGIS 3.3.

Verified on this stack:

```sql
SELECT PostGIS_Version();                              -- 3.3 USE_GEOS=1 USE_PROJ=1 USE_STATS=1
SELECT ST_DWithin(
  ST_SetSRID(ST_MakePoint(21.01, 52.23), 4326)::geography,
  ST_SetSRID(ST_MakePoint(21.012, 52.2297), 4326)::geography,
  5 * 1000);                                           -- t
```

## Migrations and seed

`supabase start` applies every file in `supabase/migrations/` in order, then
runs `supabase/seed.sql`. Reset with `npx supabase db reset`.

`supabase/seed.sql` contains **no rows, on purpose**. The schema has no
reference tables — `cuisine_type`, `dietary_tags` and `allergens` are TEXT
columns whose allowed values live in Zod schemas and TypeScript enums under
`src/types/`, not in the database — so there is nothing that both belongs in the
schema and belongs to every test.

The contract the seed file states, and which tests must follow:

> A test may assume the schema from `supabase/migrations/` is applied and that
> auth roles exist. It may assume nothing about rows.

Every test creates its own rows and deletes them in teardown, keyed by a unique
run token so parallel runs cannot collide. Authenticated fixtures are created at
runtime through `auth.admin.createUser`, never seeded: a seeded user has a fixed
id, and a fixed id in shared test data is how one test's ownership assertion
becomes another test's false pass.

## Authorization is verifiable here

Access control is two-layered: RLS policies test `auth.uid() = user_id`, and
application code calls `getUser()` + `checkOwnership()`. Neither layer is
sufficient alone. Confirmed against the local stack with the anon key:

| Request | Result |
|---|---|
| `GET /rest/v1/lunch_offers` as `anon` | `200` — `public read lunch_offers` |
| `POST /rest/v1/lunch_offers` as `anon` | `401` — `owners can modify lunch_offers` |

Anonymous callers get no `auth.uid()`, so `auth.uid() = user_id` is
`NULL = NULL`, which is not true, so the write is denied. Un-migrated rows are
unreachable for the same reason: `checkOwnership` returns `false` for a null
record user id. `migrate_session_data()` (`20250101000001`) is the only path
that assigns `user_id` to anonymous-era rows.

## Vitest can reach this stack, in its own project

`npm run test:db` runs the `db` project in `vitest.config.ts`. It loads
`tests/setup.db.ts`, which mocks nothing, and points at the local stack through
`TEST_SUPABASE_*` in `.env.local`:

```
TEST_SUPABASE_URL=http://127.0.0.1:54321
TEST_SUPABASE_ANON_KEY=<ANON_KEY from npx supabase status -o env>
TEST_SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from the same>
```

Only `TEST_SUPABASE_*` is forwarded, and only to that project. `npm test` never
sees them and never touches the database, so the ordinary suite runs without
Docker.

`tests/setup.db.ts` throws rather than guessing if the variables are missing,
and refuses to run against a non-local host unless `TEST_SUPABASE_ALLOW_REMOTE=true`.
These tests insert and delete rows; a run pointed at a real project would remove
whatever its token prefix matched.

Suites live in `__tests__/db/`. They talk to PostgREST and to SQL functions with
`@supabase/supabase-js` directly, not through `src/lib/supabase/server.ts`,
because that module reads `next/headers` and there is no Next request context in
a Vitest process. What the `db` project verifies is the database layer; the
server layer is Playwright's job.

`npm run test:coverage` measures the `unit` project. Note that Vitest writes no
coverage report for a run that has failures, so coverage currently needs #12 to
land before a full-suite number exists.

## Playwright

`__tests__/e2e/auth.spec.ts` and `__tests__/e2e/post-auth-migration.spec.ts`
deliberately stay on a **remote disposable project**, not this local stack:

- `auth.spec.ts` exercises a 5-failure / 15-minute login rate limit. That is a
  Supabase project setting the local stack does not reproduce.
- `post-auth-migration.spec.ts` needs a service-role key and, separately, a
  hand-applied failure fixture.

Both are gated on `PLAYWRIGHT_SUPABASE_TEST_ENABLED=true`, so neither runs in
normal development. The four variables they read are documented in
`.env.local.example`.

`auth.spec.ts` has no teardown and leaves its `playwright-auth-*@example.test`
users in the project. That is a known cost of the disposable-project approach
and the reason not to point it at anything you care about.