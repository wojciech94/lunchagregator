# Design Document — User Authentication

## Overview

This document describes the technical design for replacing the anonymous `session_token` mechanism with full Supabase Auth-based user accounts in the Lunch Agregator application.

The current system identifies restaurant/offer owners via a UUID stored in an HttpOnly cookie (`lunch_session_token`). The new system replaces this with Supabase Auth JWT sessions, adds registration/login/logout flows, protects management routes via Next.js Middleware, migrates existing anonymous data to authenticated accounts, and updates the NavHeader to reflect auth state.

Public browsing (listing restaurants and offers) remains unauthenticated. Only management operations (create/edit/delete restaurants and offers) require a logged-in account.

### Key Design Decisions

- **Supabase Auth as the identity provider** — already integrated via `@supabase/ssr`; no additional auth library needed.
- **`@supabase/ssr` cookie handling** — the existing `createServerClient` in `src/lib/supabase/server.ts` already handles JWT cookie read/write correctly for Next.js App Router. The Middleware will reuse this pattern.
- **Server-side session verification** — all ownership checks happen in Server Actions using the Supabase server client; the client never sends a `user_id` directly.
- **SSR-safe NavHeader** — the root layout (`src/app/layout.tsx`) is a Server Component; `NavHeader` will be converted to a Server Component that reads auth state from the Supabase server client, eliminating the hydration mismatch risk.
- **Single-transaction migration** — anonymous data migration runs inside a Postgres function called via Supabase RPC to guarantee atomicity.
- **Rate limiting via Supabase Auth** — Supabase Auth has built-in rate limiting; the 5-attempt / 15-minute block requirement is enforced at the Auth service level and surfaced to the UI via error codes.

---

## Architecture

```mermaid
flowchart TD
    Browser -->|HTTP request| Middleware
    Middleware -->|Protected route + no session| LoginRedirect["/auth/login?redirectTo=..."]
    Middleware -->|Protected route + valid session| AppRouter[Next.js App Router]
    Middleware -->|Public route| AppRouter

    AppRouter -->|Server Component| SupabaseServer[Supabase Server Client]
    AppRouter -->|Server Action| ServerAction[Server Action]
    ServerAction -->|auth.getUser()| SupabaseServer
    ServerAction -->|DB mutation| SupabaseDB[(Supabase DB)]

    Browser -->|Client Component| SupabaseBrowser[Supabase Browser Client]
    SupabaseBrowser -->|onAuthStateChange| NavHeader

    SupabaseServer -->|JWT cookie| SupabaseAuth[Supabase Auth]
    SupabaseAuth -->|JWT refresh| SupabaseServer
```

### Request Flow — Protected Route

1. Browser requests `/restaurants/new`.
2. **Middleware** (`src/middleware.ts`) intercepts the request, calls `supabase.auth.getUser()` via the server client.
3. If no valid session → redirect to `/auth/login?redirectTo=/restaurants/new`.
4. If valid session → request passes through to the page.
5. The page's Server Action also calls `supabase.auth.getUser()` before any DB mutation (defense in depth).

### Request Flow — Login

1. User submits the login form → `loginAction` Server Action.
2. Zod validates email + password server-side.
3. `supabase.auth.signInWithPassword()` is called; Supabase sets the JWT cookie via `@supabase/ssr`.
4. If a `lunch_session_token` cookie exists, the migration RPC is called.
5. On success, `redirect(redirectTo ?? '/')`.

---

## Components and Interfaces

### New Files

| Path | Type | Purpose |
|---|---|---|
| `src/middleware.ts` | Next.js Middleware | Session verification + protected route redirect |
| `src/app/auth/login/page.tsx` | Server Component | Login page shell |
| `src/app/auth/register/page.tsx` | Server Component | Registration page shell |
| `src/components/auth/LoginForm.tsx` | Client Component | react-hook-form login form |
| `src/components/auth/RegisterForm.tsx` | Client Component | react-hook-form registration form |
| `src/actions/auth.ts` | Server Actions | `loginAction`, `registerAction`, `logoutAction` |
| `src/lib/auth.ts` | Utility | `getUser()` — thin wrapper around `supabase.auth.getUser()` for Server Components/Actions |

### Modified Files

| Path | Change |
|---|---|
| `src/components/NavHeader.tsx` | Convert to Server Component; read auth state via `getUser()`; add logout button |
| `src/app/layout.tsx` | No structural change; NavHeader becomes async Server Component |
| `src/actions/restaurants.ts` | Replace `session_token` ownership checks with `user_id` from `getUser()` |
| `src/actions/offers.ts` | Same as restaurants — replace `session_token` with `user_id` |
| `src/lib/session.ts` | Deprecated (kept for migration period, then removed) |
| `src/actions/session.ts` | Deprecated (kept for migration period, then removed) |

### Deprecated Files (to be removed after migration)

- `src/lib/session.ts`
- `src/actions/session.ts`

### Server Action Interfaces

```typescript
// src/actions/auth.ts

export type AuthActionResult =
  | { success: true }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

export async function registerAction(
  formData: FormData
): Promise<AuthActionResult>;

export async function loginAction(
  formData: FormData
): Promise<AuthActionResult>;

export async function logoutAction(): Promise<void>; // redirects on success
```

```typescript
// src/lib/auth.ts

import type { User } from '@supabase/supabase-js';

/**
 * Returns the authenticated user from the current request context,
 * or null if no valid session exists.
 * Uses supabase.auth.getUser() which validates the JWT server-side.
 */
export async function getUser(): Promise<User | null>;
```

### Middleware Interface

```typescript
// src/middleware.ts

export const config = {
  matcher: [
    '/restaurants/new',
    '/restaurants/:id/edit',
    '/offers/:id/edit',
    '/add',
  ],
};

export async function middleware(request: NextRequest): Promise<NextResponse>;
```

The middleware creates a Supabase server client (using `@supabase/ssr`'s `createServerClient` with `NextRequest`/`NextResponse` cookie adapters), calls `supabase.auth.getUser()`, and redirects unauthenticated requests to `/auth/login?redirectTo={pathname}`.

### Zod Schemas

```typescript
// src/schemas/auth.schema.ts

export const loginSchema = z.object({
  email: z.string().email('Nieprawidłowy adres e-mail'),
  password: z.string().min(1, 'Hasło jest wymagane'),
});

export const registerSchema = z.object({
  email: z.string().email('Nieprawidłowy adres e-mail'),
  password: z.string().min(8, 'Hasło musi mieć co najmniej 8 znaków'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
```

### NavHeader Auth State

`NavHeader` becomes an `async` Server Component. It calls `getUser()` and renders either:
- **Authenticated**: user email + "Wyloguj się" button (which calls `logoutAction` via a `<form>` action).
- **Guest**: "Zaloguj się" and "Zarejestruj się" links.

Because it is a Server Component rendered in the root layout, the initial HTML always reflects the correct auth state — no hydration mismatch. Client-side navigation updates are handled by Next.js's full-page revalidation on auth state changes (login/logout both call `redirect()` which triggers a full navigation).

---

## Data Models

### Database Schema Changes

Two columns need to be added to existing tables, and the old `session_token` column is deprecated (kept during migration, removed after).

#### `restaurants` table

```sql
-- Add user_id column (nullable during migration period)
ALTER TABLE restaurants
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for ownership lookups
CREATE INDEX idx_restaurants_user_id ON restaurants(user_id);

-- After migration is complete (separate migration):
-- ALTER TABLE restaurants DROP COLUMN session_token;
```

#### `lunch_offers` table

```sql
-- Add user_id column (nullable during migration period)
ALTER TABLE lunch_offers
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for ownership lookups
CREATE INDEX idx_lunch_offers_user_id ON lunch_offers(user_id);

-- After migration is complete (separate migration):
-- ALTER TABLE lunch_offers DROP COLUMN session_token;
```

#### Migration RPC Function

```sql
-- Postgres function called via supabase.rpc('migrate_session_data', {...})
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
```

The function runs both UPDATEs in a single transaction (Postgres default). If either fails, the entire transaction rolls back.

### TypeScript Types

```typescript
// Additions to src/types/restaurants.ts

export interface Restaurant {
  // ... existing fields ...
  userId: string | null;       // replaces sessionToken ownership
  sessionToken: string | null; // kept during migration, nullable
}
```

### Row Level Security (RLS)

Supabase RLS policies should be updated to allow owners to modify their own records. However, since all mutations go through Server Actions (which use the service role or validate ownership in application code), RLS is a secondary defense layer. The recommended approach:

```sql
-- Allow authenticated users to update/delete their own restaurants
CREATE POLICY "owners can modify restaurants"
  ON restaurants
  FOR ALL
  USING (auth.uid() = user_id);

-- Allow anyone to read restaurants (public browsing)
CREATE POLICY "public read restaurants"
  ON restaurants
  FOR SELECT
  USING (true);
```

### Session Cookie

Supabase Auth manages the JWT cookie automatically via `@supabase/ssr`. The cookie is set with:
- `HttpOnly: true`
- `Secure: true` (in production)
- `SameSite: Lax`
- Expiry: controlled by Supabase Auth (access token ~1 hour, refresh token ~7 days)

The 7-day inactivity expiry (Requirement 8.2) is configured in the Supabase project dashboard under Authentication → JWT expiry settings.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Zod auth schemas accept valid credentials and reject invalid ones

*For any* string input to `registerSchema` or `loginSchema`, the schema SHALL return `success: true` if and only if the email is a valid RFC 5322 address (contains `@` and a domain) and the password has length ≥ 8 (for registration) or length ≥ 1 (for login); all other inputs SHALL return `success: false` with field-level errors identifying each invalid field.

**Validates: Requirements 1.2, 1.3, 1.5, 8.4**

### Property 2: redirectTo sanitization only accepts internal paths

*For any* string value passed as `redirectTo`, the sanitization function SHALL return that value unchanged if and only if it starts with `/` and does not start with `//`; any external URL, protocol-relative URL, or empty string SHALL cause the function to return `/` as the fallback.

**Validates: Requirements 2.2**

### Property 3: Middleware redirects unauthenticated requests to protected routes

*For any* request to a protected route path (`/restaurants/new`, `/restaurants/[id]/edit`, `/offers/[id]/edit`, `/add`) where `getUser()` returns `null`, the Middleware SHALL redirect the request to `/auth/login?redirectTo={original_path}` and SHALL NOT allow the request to reach the page handler.

**Validates: Requirements 3.5, 4.1**

### Property 4: Middleware passes authenticated requests to protected routes

*For any* request to a protected route path where `getUser()` returns a valid `User` object, the Middleware SHALL allow the request to pass through without any redirect.

**Validates: Requirements 4.3**

### Property 5: Server Actions reject unauthenticated mutation calls

*For any* Server Action that creates, updates, or deletes a restaurant or offer, if `getUser()` returns `null` at the time of the call, the action SHALL return `{ success: false, error: 'Brak autoryzacji' }` and SHALL NOT execute any database write.

**Validates: Requirements 4.5**

### Property 6: Ownership check correctness

*For any* pair of UUIDs `(requestingUserId, recordUserId)`, the ownership check SHALL return `true` if and only if both values are non-null and strictly equal; if either value is `null` or they differ, the check SHALL return `false` and the mutating operation SHALL be rejected.

**Validates: Requirements 5.3, 5.4, 5.5**

### Property 7: user_id is stored on resource creation

*For any* authenticated user creating a restaurant or lunch offer, the record inserted into the database SHALL have a `user_id` column value equal to the authenticated user's `id`; no record SHALL be created with a `user_id` that differs from the currently authenticated user.

**Validates: Requirements 5.1, 5.2**

### Property 8: Edit/delete UI controls are only shown to the resource owner

*For any* resource (restaurant or lunch offer) and any viewer, the edit and delete UI controls SHALL be rendered if and only if the viewer is authenticated and their `user_id` equals the resource's `user_id`; for all other combinations (guest viewer, or authenticated user with non-matching `user_id`), those controls SHALL NOT be rendered.

**Validates: Requirements 5.6**

### Property 9: Migration updates only user_id on matching NULL records and leaves all other fields unchanged

*For any* call to `migrate_session_data(session_token, user_id)` on a set of records, only records where `session_token = p_session_token` AND `user_id IS NULL` SHALL have their `user_id` column set to `p_user_id`; all other records SHALL remain completely unchanged, and for every migrated record, all columns other than `user_id` SHALL retain their pre-migration values.

**Validates: Requirements 6.2, 6.5, 6.6**

### Property 10: Migration is atomic — any database error rolls back all changes

*For any* call to `migrate_session_data` that encounters a database error at any point during execution, the function SHALL roll back all changes made within that invocation, leaving every row in `restaurants` and `lunch_offers` in exactly the same state as before the call began.

**Validates: Requirements 6.4**

### Property 11: NavHeader renders the authenticated user's email and logout button

*For any* authenticated user object with a non-empty email address, the rendered `NavHeader` component SHALL contain the user's email address and a logout button, and SHALL NOT contain login or register links.

**Validates: Requirements 7.1**

### Property 12: NavHeader SSR and client render produce identical output

*For any* auth state (authenticated user or null), the server-side rendered HTML of `NavHeader` SHALL be byte-for-byte identical to the client-side rendered HTML for the same auth state, producing no hydration mismatch warnings.

**Validates: Requirements 7.4**

---

## Error Handling

### Registration Errors

| Condition | Supabase error code | User-facing message |
|---|---|---|
| Duplicate email | `user_already_exists` | "Konto z tym adresem e-mail już istnieje" |
| Invalid email format | Zod (pre-Supabase) | Field-level: "Nieprawidłowy adres e-mail" |
| Password too short | Zod (pre-Supabase) | Field-level: "Hasło musi mieć co najmniej 8 znaków" |
| Supabase timeout (>5s) | Network error | "Wystąpił błąd podczas rejestracji. Spróbuj ponownie." |
| Other Supabase error | Any other code | "Wystąpił błąd podczas rejestracji. Spróbuj ponownie." |

### Login Errors

| Condition | Supabase error code | User-facing message |
|---|---|---|
| Wrong credentials | `invalid_credentials` | "Nieprawidłowy adres e-mail lub hasło" |
| Rate limited | `over_request_rate_limit` | "Zbyt wiele nieudanych prób. Spróbuj ponownie za 15 minut." |
| Timeout (>5s) | Network error | "Przekroczono limit czasu. Spróbuj ponownie." |
| Other error | Any other code | "Wystąpił błąd podczas logowania. Spróbuj ponownie." |

### Logout Errors

If `supabase.auth.signOut()` fails, the Server Action returns an error result and the UI displays "Wystąpił błąd podczas wylogowania." The user remains on the current page.

### Migration Errors

Migration errors are non-fatal to the login flow. If the RPC call fails:
1. The error is logged server-side.
2. The user is shown a non-blocking toast/banner: "Nie udało się przypisać wcześniejszych danych do konta. Skontaktuj się z pomocą techniczną."
3. Login/registration completes normally and the user is redirected.

### Unauthorized Server Action Calls

If a Server Action that requires authentication is called without a valid session (e.g., direct API call bypassing Middleware):
- `getUser()` returns `null`.
- The action returns `{ success: false, error: 'Brak autoryzacji' }`.
- No database write occurs.

---

## Testing Strategy

### Unit Tests (Vitest)

Unit tests focus on pure logic that can be tested in isolation:

- **Zod schema validation** (`src/schemas/auth.schema.ts`):
  - Valid email + password combinations pass.
  - Invalid email formats are rejected with correct field errors.
  - Passwords shorter than 8 characters are rejected.
  - Empty/whitespace-only fields are rejected.

- **`redirectTo` sanitization utility**:
  - Internal paths (`/restaurants/new`) are accepted.
  - External URLs (`https://evil.com`) are rejected.
  - Protocol-relative URLs (`//evil.com`) are rejected.
  - Empty string falls back to `/`.

- **Ownership check logic** (extracted pure function):
  - Matching `user_id` returns `true`.
  - Mismatched `user_id` returns `false`.
  - `null` record `user_id` returns `false`.

### Property-Based Tests (Vitest + fast-check)

Property tests use `fast-check` (already in `devDependencies`) to verify universal properties across generated inputs. Each test runs a minimum of 100 iterations.

**Property 1 — Zod auth schema correctness**:
- Generate arbitrary email strings and password strings of varying length; verify `registerSchema.safeParse()` returns `success: true` only for valid RFC 5322 emails with passwords ≥ 8 chars, and `success: false` with field errors otherwise.
- Tag: `Feature: user-authentication, Property 1: Zod auth schemas accept valid credentials and reject invalid ones`

**Property 2 — redirectTo sanitization**:
- Generate arbitrary strings (including URLs, protocol-relative paths, empty strings, internal paths); verify the sanitization function returns the input only when it starts with `/` and not `//`, and returns `/` for all other inputs.
- Tag: `Feature: user-authentication, Property 2: redirectTo sanitization only accepts internal paths`

**Property 3 — Middleware redirects unauthenticated requests**:
- Generate arbitrary protected route paths; mock `getUser()` to return `null`; verify the middleware response is a redirect to `/auth/login?redirectTo={path}`.
- Tag: `Feature: user-authentication, Property 3: Middleware redirects unauthenticated requests to protected routes`

**Property 4 — Middleware passes authenticated requests**:
- Generate arbitrary protected route paths; mock `getUser()` to return a valid user; verify the middleware response is not a redirect.
- Tag: `Feature: user-authentication, Property 4: Middleware passes authenticated requests to protected routes`

**Property 5 — Server Actions reject unauthenticated calls**:
- For each mutating Server Action, mock `getUser()` to return `null`; verify the action returns `{ success: false }` and no DB call is made.
- Tag: `Feature: user-authentication, Property 5: Server Actions reject unauthenticated mutation calls`

**Property 6 — Ownership check correctness**:
- Generate arbitrary pairs of UUID strings (including null values); verify the ownership check returns `true` only when both are non-null and strictly equal.
- Tag: `Feature: user-authentication, Property 6: Ownership check correctness`

**Property 7 — user_id stored on resource creation**:
- Generate arbitrary user IDs and resource input data; mock the DB insert; verify the inserted row's `user_id` equals the authenticated user's `id`.
- Tag: `Feature: user-authentication, Property 7: user_id is stored on resource creation`

**Property 8 — Edit/delete UI controls shown only to owner**:
- Generate arbitrary resource objects and viewer user IDs; render the resource component; verify edit/delete controls appear only when `resource.user_id === viewer.id`.
- Tag: `Feature: user-authentication, Property 8: Edit/delete UI controls are only shown to the resource owner`

**Property 9 — Migration selectivity and field preservation**:
- Generate arbitrary sets of records with mixed `user_id` (NULL and non-NULL) and `session_token` values; call the migration logic; verify only NULL-`user_id` records with the matching token have `user_id` updated, and all other columns are unchanged.
- Tag: `Feature: user-authentication, Property 9: Migration updates only user_id on matching NULL records and leaves all other fields unchanged`

**Property 10 — Migration atomicity**:
- Simulate a DB error mid-migration; verify all records remain in their pre-call state.
- Tag: `Feature: user-authentication, Property 10: Migration is atomic — any database error rolls back all changes`

**Property 11 — NavHeader renders authenticated state**:
- Generate arbitrary user objects with email; render `NavHeader`; verify email and logout button are present and login/register links are absent.
- Tag: `Feature: user-authentication, Property 11: NavHeader renders the authenticated user's email and logout button`

**Property 12 — NavHeader SSR/hydration consistency**:
- For any auth state, compare server-rendered and client-rendered `NavHeader` output; verify they are identical.
- Tag: `Feature: user-authentication, Property 12: NavHeader SSR and client render produce identical output`

### Integration Tests (Playwright)

End-to-end tests cover the full auth flows against a real Supabase test project or local Supabase instance:

- **Registration flow**: Fill form → submit → verify redirect to `/` → verify NavHeader shows email.
- **Login flow**: Submit valid credentials → verify redirect → verify session cookie is HttpOnly.
- **Logout flow**: Click logout → verify redirect to `/` → verify NavHeader shows guest state.
- **Protected route redirect**: Navigate to `/restaurants/new` as guest → verify redirect to `/auth/login?redirectTo=/restaurants/new`.
- **Post-login redirect**: Login from `/auth/login?redirectTo=/restaurants/new` → verify redirect to `/restaurants/new`.
- **Migration flow**: Set `lunch_session_token` cookie → register → verify cookie is removed → verify records are associated with new account.
- **Rate limiting**: Attempt 5 failed logins → verify rate limit error message on 6th attempt.

### Snapshot / SSR Tests

- Render `NavHeader` as a Server Component with a mocked authenticated user → verify email and logout button are present in the HTML.
- Render `NavHeader` with no session → verify login/register links are present.
- Verify no hydration mismatch by comparing SSR output with client render output.
