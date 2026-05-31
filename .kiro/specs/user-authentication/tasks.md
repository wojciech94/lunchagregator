# Implementation Plan: User Authentication

## Overview

Replace the anonymous `session_token` mechanism with full Supabase Auth-based user accounts. The implementation proceeds in layers: shared utilities and schemas first, then middleware and auth flows, then ownership enforcement in existing Server Actions, then UI updates (NavHeader, edit/delete visibility), and finally anonymous data migration.

## Tasks

- [x] 1. Create auth schemas and shared utility
  - [x] 1.1 Create Zod validation schemas for login and registration
    - Create `src/schemas/auth.schema.ts` with `loginSchema`, `registerSchema`, and their inferred TypeScript types
    - Email must match RFC 5322 format; password ≥ 8 chars for register, ≥ 1 char for login
    - Export `LoginInput` and `RegisterInput` types
    - _Requirements: 1.2, 1.3, 8.4_

  - [ ]* 1.2 Write property test for Zod auth schemas (Property 1)
    - **Property 1: Zod auth schemas accept valid credentials and reject invalid ones**
    - Use `fast-check` to generate arbitrary email and password strings; assert `registerSchema.safeParse()` returns `success: true` iff email is valid RFC 5322 and password length ≥ 8, and `loginSchema.safeParse()` returns `success: true` iff email is valid and password length ≥ 1
    - **Validates: Requirements 1.2, 1.3, 1.5, 8.4**

  - [x] 1.3 Create `getUser()` utility and `redirectTo` sanitization helper
    - Create `src/lib/auth.ts` with `getUser(): Promise<User | null>` wrapping `supabase.auth.getUser()`
    - Add `sanitizeRedirectTo(value: string | null | undefined): string` that returns the value unchanged only when it starts with `/` and not `//`, otherwise returns `/`
    - _Requirements: 2.2, 4.5_

  - [ ]* 1.4 Write property test for `redirectTo` sanitization (Property 2)
    - **Property 2: redirectTo sanitization only accepts internal paths**
    - Use `fast-check` to generate arbitrary strings (including URLs, protocol-relative paths, empty strings, internal paths); assert the function returns the input only when it starts with `/` and not `//`, and returns `/` for all other inputs
    - **Validates: Requirements 2.2**

- [x] 2. Implement Next.js Middleware for route protection
  - [x] 2.1 Create `src/middleware.ts` with protected route matcher and redirect logic
    - Create the middleware file with the `config.matcher` array covering `/restaurants/new`, `/restaurants/:id/edit`, `/offers/:id/edit`, `/offers/:id/delete`, `/add`
    - Use `@supabase/ssr` `createServerClient` with `NextRequest`/`NextResponse` cookie adapters
    - Call `supabase.auth.getUser()`; if `null`, redirect to `/auth/login?redirectTo={pathname}`; otherwise call `NextResponse.next()`
    - _Requirements: 3.5, 4.1, 4.2, 4.3, 4.4_

  - [ ]* 2.2 Write property test for middleware — unauthenticated redirect (Property 3)
    - **Property 3: Middleware redirects unauthenticated requests to protected routes**
    - Use `fast-check` to generate arbitrary protected route paths; mock `getUser()` to return `null`; assert the middleware response is a redirect to `/auth/login?redirectTo={path}`
    - **Validates: Requirements 3.5, 4.1**

  - [ ]* 2.3 Write property test for middleware — authenticated pass-through (Property 4)
    - **Property 4: Middleware passes authenticated requests to protected routes**
    - Use `fast-check` to generate arbitrary protected route paths; mock `getUser()` to return a valid `User` object; assert the middleware response is not a redirect
    - **Validates: Requirements 4.3**

- [x] 3. Implement auth Server Actions
  - [x] 3.1 Create `src/actions/auth.ts` with `registerAction`, `loginAction`, and `logoutAction`
    - `registerAction(formData)`: validate with `registerSchema`, call `supabase.auth.signUp()`, handle `user_already_exists` and other errors per the error table in the design, redirect to `/` on success
    - `loginAction(formData)`: validate with `loginSchema`, call `supabase.auth.signInWithPassword()`, handle `invalid_credentials`, `over_request_rate_limit`, timeout, and other errors per the design error table; call migration RPC if `lunch_session_token` cookie exists; redirect to sanitized `redirectTo` on success
    - `logoutAction()`: call `supabase.auth.signOut()`, redirect to `/` on success; return error result on failure
    - Export `AuthActionResult` type
    - _Requirements: 1.1, 1.4, 1.6, 1.8, 2.1, 2.2, 2.3, 3.1, 3.2_

  - [ ]* 3.2 Write property test for Server Actions rejecting unauthenticated calls (Property 5)
    - **Property 5: Server Actions reject unauthenticated mutation calls**
    - For each mutating Server Action (create/edit/delete restaurant and offer), mock `getUser()` to return `null`; assert the action returns `{ success: false }` and no DB call is made
    - **Validates: Requirements 4.5**

- [x] 4. Create auth UI pages and form components
  - [x] 4.1 Create `src/components/auth/LoginForm.tsx` Client Component
    - Use `react-hook-form` with `loginSchema` for client-side validation
    - Display field-level errors for email and password
    - Call `loginAction` on submit; display server-returned error messages
    - Show loading state while the action is pending
    - _Requirements: 2.3, 2.4_

  - [x] 4.2 Create `src/components/auth/RegisterForm.tsx` Client Component
    - Use `react-hook-form` with `registerSchema` for client-side validation
    - Display field-level errors for email and password
    - Call `registerAction` on submit; display server-returned error messages (including duplicate email)
    - Show loading state while the action is pending
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.8_

  - [x] 4.3 Create `src/app/auth/login/page.tsx` and `src/app/auth/register/page.tsx` Server Component shells
    - Login page renders `LoginForm` and a link to `/auth/register`
    - Register page renders `RegisterForm` and a link to `/auth/login`
    - Both pages pass the `redirectTo` search param to their respective forms
    - _Requirements: 1.7, 2.4_

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Update Server Actions to use `user_id` ownership
  - [x] 6.1 Extract and implement a pure `checkOwnership(requestingUserId, recordUserId)` function
    - Create `src/lib/ownership.ts` with `checkOwnership(requestingUserId: string | null, recordUserId: string | null): boolean`
    - Returns `true` only when both values are non-null and strictly equal
    - _Requirements: 5.3, 5.4, 5.5_

  - [ ]* 6.2 Write property test for ownership check (Property 6)
    - **Property 6: Ownership check correctness**
    - Use `fast-check` to generate arbitrary pairs of UUID strings (including null values); assert `checkOwnership` returns `true` only when both are non-null and strictly equal
    - **Validates: Requirements 5.3, 5.4, 5.5**

  - [x] 6.3 Update `src/actions/restaurants.ts` to use `user_id` from `getUser()`
    - Replace `session_token` ownership checks with `getUser()` + `checkOwnership()`
    - On create: set `user_id` from `getUser()` on the inserted record
    - On edit/delete: call `getUser()`, call `checkOwnership()`, reject with `'Brak uprawnień do tej operacji'` if false
    - If `getUser()` returns `null`, return `{ success: false, error: 'Brak autoryzacji' }` without any DB write
    - _Requirements: 4.5, 5.1, 5.3, 5.4, 5.5_

  - [ ]* 6.4 Write property test for `user_id` stored on restaurant creation (Property 7)
    - **Property 7: user_id is stored on resource creation**
    - Generate arbitrary user IDs and restaurant input data; mock the DB insert; assert the inserted row's `user_id` equals the authenticated user's `id`
    - **Validates: Requirements 5.1**

  - [x] 6.5 Update `src/actions/offers.ts` to use `user_id` from `getUser()`
    - Same pattern as `restaurants.ts`: replace `session_token` with `getUser()` + `checkOwnership()`
    - On create: set `user_id` from `getUser()` on the inserted record
    - On edit/delete: call `getUser()`, call `checkOwnership()`, reject with `'Brak uprawnień do tej operacji'` if false
    - _Requirements: 4.5, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 6.6 Write property test for `user_id` stored on offer creation (Property 7)
    - **Property 7: user_id is stored on resource creation**
    - Generate arbitrary user IDs and offer input data; mock the DB insert; assert the inserted row's `user_id` equals the authenticated user's `id`
    - **Validates: Requirements 5.2**

- [x] 7. Update UI to show edit/delete controls only to resource owners
  - [x] 7.1 Update restaurant and offer components to conditionally render edit/delete controls
    - Pass the current viewer's `user_id` (from `getUser()` in the parent Server Component) down to restaurant and offer card/detail components
    - Render edit and delete buttons only when `resource.user_id === viewer.userId` (both non-null)
    - Hide all edit/delete controls for Guest viewers
    - _Requirements: 5.6_

  - [ ]* 7.2 Write property test for edit/delete UI visibility (Property 8)
    - **Property 8: Edit/delete UI controls are only shown to the resource owner**
    - Use `fast-check` to generate arbitrary resource objects and viewer user IDs; render the resource component; assert edit/delete controls appear only when `resource.user_id === viewer.id` and both are non-null
    - **Validates: Requirements 5.6**

- [x] 8. Update NavHeader to reflect auth state
  - [x] 8.1 Convert `NavHeader` to an async Server Component
    - Import and call `getUser()` inside `NavHeader`
    - If authenticated: render user email and a `<form action={logoutAction}>` with a "Wyloguj się" submit button
    - If guest: render "Zaloguj się" link to `/auth/login` and "Zarejestruj się" link to `/auth/register`
    - _Requirements: 7.1, 7.2, 7.4, 7.5_

  - [ ]* 8.2 Write property test for NavHeader authenticated rendering (Property 11)
    - **Property 11: NavHeader renders the authenticated user's email and logout button**
    - Use `fast-check` to generate arbitrary user objects with non-empty email; render `NavHeader` with mocked `getUser()`; assert email and logout button are present and login/register links are absent
    - **Validates: Requirements 7.1**

  - [ ]* 8.3 Write property test for NavHeader SSR/hydration consistency (Property 12)
    - **Property 12: NavHeader SSR and client render produce identical output**
    - For any auth state (authenticated user or null), compare server-rendered and client-rendered `NavHeader` output; assert they are identical and produce no hydration mismatch warnings
    - **Validates: Requirements 7.4**

- [x] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement anonymous data migration
  - [x] 10.1 Create the `migrate_session_data` Postgres function via Supabase migration
    - Write a SQL migration file in `supabase/migrations/` that creates the `migrate_session_data(p_session_token TEXT, p_user_id UUID)` RPC function as defined in the design
    - The function updates `restaurants` and `lunch_offers` in a single transaction, setting `user_id = p_user_id` only where `session_token = p_session_token AND user_id IS NULL`
    - Returns a JSONB object with `restaurants_migrated` and `offers_migrated` counts
    - _Requirements: 6.2, 6.4, 6.5, 6.6_

  - [ ]* 10.2 Write property test for migration selectivity and field preservation (Property 9)
    - **Property 9: Migration updates only user_id on matching NULL records and leaves all other fields unchanged**
    - Generate arbitrary sets of records with mixed `user_id` (NULL and non-NULL) and `session_token` values; call the migration logic; assert only NULL-`user_id` records with the matching token have `user_id` updated, and all other columns are unchanged
    - **Validates: Requirements 6.2, 6.5, 6.6**

  - [ ]* 10.3 Write property test for migration atomicity (Property 10)
    - **Property 10: Migration is atomic — any database error rolls back all changes**
    - Simulate a DB error mid-migration; assert all records remain in their pre-call state
    - **Validates: Requirements 6.4**

  - [x] 10.4 Wire migration call into `loginAction` and `registerAction`
    - After a successful `signInWithPassword` or `signUp`, read the `lunch_session_token` cookie
    - If present and non-empty, call `supabase.rpc('migrate_session_data', { p_session_token, p_user_id })`
    - On success: delete the `lunch_session_token` cookie
    - On failure: log the error server-side and surface the non-blocking message `'Nie udało się przypisać wcześniejszych danych do konta. Skontaktuj się z pomocą techniczną.'` to the UI; do not interrupt the login/registration flow
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 11. Add database schema migrations for `user_id` columns
  - [x] 11.1 Create SQL migration adding `user_id` to `restaurants` and `lunch_offers`
    - Write a Supabase migration that adds `user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL` (nullable) to both tables
    - Add indexes `idx_restaurants_user_id` and `idx_lunch_offers_user_id`
    - Add RLS policies: `public read` (SELECT for all) and `owners can modify` (ALL for `auth.uid() = user_id`) for both tables
    - _Requirements: 5.1, 5.2_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties defined in the design document
- Unit tests validate specific examples and edge cases
- The `session_token` columns and `src/lib/session.ts` / `src/actions/session.ts` files are kept during the migration period and should be removed in a follow-up cleanup task after all data has been migrated

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "6.1", "11.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "6.2"] },
    { "id": 2, "tasks": ["1.4", "2.1", "6.3", "6.5"] },
    { "id": 3, "tasks": ["2.2", "2.3", "3.1", "6.4", "6.6", "7.1"] },
    { "id": 4, "tasks": ["3.2", "4.1", "4.2", "7.2", "10.1"] },
    { "id": 5, "tasks": ["4.3", "8.1", "10.2", "10.3"] },
    { "id": 6, "tasks": ["8.2", "8.3", "10.4"] }
  ]
}
```
