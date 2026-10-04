# The admin role

Who holds it, how to grant it, how to take it away, and what will mislead you
into thinking you have done either.

The role is `app_metadata.role = 'admin'` on a Supabase auth user. It is read
by `public.is_admin()` (migration `20250101000005`), which the RLS policies on
both tables consult, so the same claim decides what a person may read, change
and destroy everywhere.

There is no UI for this and there is no self-service. A panel listing
administrators would be an account that can promote itself.

## Before anything else: is the database even reachable to you?

Check the migration history exists:

```sql
select count(*) from supabase_migrations.schema_migrations;
```

**Zero rows or an error means the deployed migrations are unknown.** This is
not hypothetical: the hosted project had no such table, so `supabase db push`
would have attempted every migration from the first one and failed partway on a
non-idempotent `CREATE POLICY`, leaving the database inconsistent without saying
so. Worse, four policies created through the Supabase dashboard had quietly
widened every write policy to "any signed-in account" — because Postgres ORs the
`USING` clauses of permissive policies, and one of them read `true`.

Fix that before granting a role. `npx supabase db push` is only safe once the
history reflects reality; see `test-database.md` for the linking procedure.

### The order matters, and it is not the obvious one

**`supabase db push` creates the history table. `supabase migration repair`
does not.** Repair inserts rows into `schema_migrations`, so against a database
without it there is nothing to insert into.

The safe sequence is therefore:

```bash
npx supabase link --project-ref <ref>
npx supabase db push --dry-run     # creates the table, shows what it would replay
npx supabase migration repair <versions...> --status applied
npx supabase db push               # now a no-op
```

`--dry-run` first, always. On an untracked database the real push would attempt
every migration from the first one and fail partway on a non-idempotent
`CREATE POLICY`, leaving it inconsistent. The dry run creates the table without
replaying anything, which is what makes the repair step possible.

Running repair *before* push works by accident when a push follows anyway,
because push creates the table afterwards. It does not work on its own.

## Grant

```ts
import { createClient } from '@supabase/supabase-js'

// service-role key -- never the anon key, never a NEXT_PUBLIC_ variable
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

await admin.auth.admin.updateUserById(userId, {
  app_metadata: { role: 'admin' },
})
```

Three things in that call are load-bearing:

1. **The service-role key.** The anon key cannot write `app_metadata` at all.
2. **`{ role: 'admin' }`, not `{ app_metadata: { role: 'admin' } }`.**
   `updateUserById` takes the claim's *contents*. Passing the claim wrapped in
   its own name is accepted without error, stores the nesting, and leaves the
   role out of the JWT — so the operator is told it worked and nobody becomes
   an admin. Asserted in `__tests__/db/grant-admin-role.test.ts`.
3. **The user id, not the email.** Look it up with
   `admin.auth.admin.listUsers()` or in the dashboard's URL.

### Then the person must sign in again

This reads as a bug when nobody knows it. A session that already exists keeps
the JWT it signed, which carries no role claim, so `is_admin()` returns false
and every admin action is refused.

Grant, then sign out and back in. **Not a refresh** — a fresh sign-in that
mints a new token.

## Revoke

Same call, same shape, with any non-admin value:

```ts
await admin.auth.admin.updateUserById(userId, { app_metadata: { role: 'user' } })
```

There is no "unset". `updateUserById` merges rather than replaces, so:

- `{ app_metadata: { role: 'user' } }` — **revokes**, because the key is rewritten
- `{ app_metadata: {} }` — **does not revoke**, because an empty object leaves
  the existing key alone, and the privilege survives a revocation someone
  believes they performed

Both asserted in the test.

## Why not the dashboard

The Supabase dashboard exposes `app_metadata` as read-only detail; there is no
input for it. Re-check when a Studio version changes, because it would be the
friendlier route. Until then the choices are the admin API above, or SQL:

```sql
UPDATE auth.users
   SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', 'admin')
 WHERE email = 'you@example.com';
```

That works and has been verified against the hosted project. It writes to a
schema GoTrue owns, so prefer the API; SQL is for a locked-out operator with
database access.

## Settled

**Admin is per person, never a shared account.** A shared account survives one
person leaving and is a worse audit trail. Every admin action is recorded with
`actor_id` (migration `20250101000006`), and a shared account would attribute
it to an account rather than to a person.

**Deleting an admin's account does not revoke the role**, because the role
lives on the account being deleted. Their own offers become orphans through
`ON DELETE SET NULL` for the next admin to reclaim. If the account is deleted
for any reason, expect to reassign the role elsewhere first.

## Verify

`npm run test:db -- __tests__/db/grant-admin-role.test.ts` executes the whole
procedure against a real database: granting, the nesting mistake that silently
does nothing, the empty-object revocation that silently does nothing, real
revocation, and the anon key being refused.

To check a deployment rather than the procedure, read the claim off a fresh
session's cookie:

```
JSON.parse(atob(cookieValue.split('.')[1])).app_metadata
```

The session cookie is `httpOnly`, so this has to be read from DevTools →
Application → Cookies, not from the page.
