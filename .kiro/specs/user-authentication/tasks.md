# Implementation Plan: User Authentication

## Overview

Checked items were reconciled with the existing TypeScript, SQL, and UI implementation. The remaining work closes auth-flow timing and migration-warning gaps, hardens the session/HTTPS boundary, and adds the property, unit, and integration coverage required by the design. Tasks build on the completed Supabase Auth foundation and finish with fully wired validation.

## Tasks

- [x] 1. Create auth schemas and shared utilities
  - [x] 1.1 Create Zod validation schemas for login and registration
    - `src/schemas/auth.schema.ts` exports login/register schemas and inferred types with the specified email and password rules.
    - _Requirements: 1.2, 1.3, 8.4_
  - [x] 1.2 Write property test for Zod auth schemas (Property 1)
    - Create `src/schemas/auth.schema.property.test.ts` with `fast-check` generators; require at least 100 runs.
    - **Property 1: Zod auth schemas accept valid credentials and reject invalid ones.**
    - **Validates: Requirements 1.2, 1.3, 1.5, 8.4**
  - [x] 1.3 Create `getUser()` and `sanitizeRedirectTo()` utilities
    - `src/lib/auth.ts` validates the server-side user and permits only internal, non-protocol-relative redirect paths.
    - _Requirements: 2.2, 4.5_
  - [x] 1.4 Write property test for redirect sanitization (Property 2)
    - Create `src/lib/auth.redirect.property.test.ts`; generate arbitrary strings and verify only values starting with `/` but not `//` are preserved.
    - **Property 2: redirectTo sanitization only accepts internal paths.**
    - **Validates: Requirements 2.2**
  - [x] 1.5 Configure the shared Vitest test environment and Supabase/Next mocks
    - Add `vitest.config.ts` and `tests/setup.ts` so Server Actions, Server Components, middleware, and property tests have deterministic cookie/auth mocks.
    - _Requirements: 1.1, 2.1, 3.1, 4.1_

- [x] 2. Complete secure middleware and session handling
  - [x] 2.1 Create route-protection middleware
    - `src/middleware.ts` matches every specified Protected_Route, redirects Guests with `redirectTo`, passes authenticated users, and skips Public_Route session checks.
    - _Requirements: 3.5, 4.1, 4.2, 4.3, 4.4_
  - [x] 2.2 Harden cookie, refresh, and HTTPS handling in the Supabase request adapters
    - Update `src/middleware.ts` and `src/lib/supabase/server.ts` to preserve Supabase cookie mutations, enforce the production JWT cookie flags, refresh an expiring session through the Supabase SSR flow, and treat refresh failures as Guest state.
    - Redirect insecure `/auth/*` credential requests to HTTPS without running protected-route authentication for Public_Routes or creating local-development redirect loops.
    - _Requirements: 2.5, 2.6, 3.4, 4.4, 8.1, 8.5_
  - [x] 2.3 Write property test for unauthenticated protected-route redirects (Property 3)
    - Create `src/middleware.unauthenticated.property.test.ts`; generate each protected-route shape with a null user and assert a login redirect containing the original pathname.
    - **Property 3: Middleware redirects unauthenticated requests to protected routes.**
    - **Validates: Requirements 3.5, 4.1**
  - [x] 2.4 Write property test for authenticated protected-route pass-through (Property 4)
    - Create `src/middleware.authenticated.property.test.ts`; generate protected-route paths with a valid user and assert no redirect.
    - **Property 4: Middleware passes authenticated requests to protected routes.**
    - **Validates: Requirements 4.3**
  - [x] 2.5 Write focused middleware/session security tests
    - Verify HTTPS redirect behavior, cookie option propagation, silent refresh, and Guest handling when refresh fails.
    - _Requirements: 2.5, 2.6, 3.4, 4.4, 8.1, 8.5_

- [x] 3. Complete auth Server Action behavior and end-to-end flows
  - [x] 3.1 Implement the core registration, login, logout, and migration invocation actions
    - `src/actions/auth.ts` validates credentials before Supabase calls, maps documented error messages, sanitizes redirects, invokes migration after successful authentication, and signs out through Supabase.
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.8, 2.2, 2.3, 3.2, 6.1, 6.2, 6.3_
  - [x] 3.2 Enforce auth operation time budgets and successful transition semantics
    - Update `src/actions/auth.ts`, `LoginForm.tsx`, and `RegisterForm.tsx` to time out registration/login at 5 seconds and logout at 3 seconds, map timeout and logout failures to the required messages, and guarantee a successful registration has an authenticated session before redirecting.
    - Keep redirects internal, preserve the valid `redirectTo` behavior, and replace direct browser reloads with the Next.js navigation/refresh path needed to update NavHeader promptly.
    - _Requirements: 1.1, 1.6, 2.1, 2.2, 3.1, 3.2, 3.3, 7.3_
  - [x] 3.3 Write unit tests for auth action success and error mapping
    - Test validation-before-provider calls, duplicate email, invalid credentials, rate-limit mapping, generic errors, timeouts, failed logout, and safe redirects using mocked Supabase responses.
    - _Requirements: 1.1, 1.4, 1.5, 1.8, 2.1, 2.3, 3.1, 8.3, 8.4_
  - [x] 3.4 Write Playwright coverage for registration, login, logout, and protected-route return
    - Use a Supabase test environment to verify session-cookie behavior, redirects, guest/authenticated NavHeader state, and the rate-limit message returned by the Auth service.
    - _Requirements: 1.1, 1.6, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.5, 7.1, 7.2, 8.3_

- [x] 4. Create auth pages and form components
  - [x] 4.1 Create `LoginForm` with client validation, pending state, and server error presentation.
    - _Requirements: 2.3, 2.4_
  - [x] 4.2 Create `RegisterForm` with client validation, field errors, duplicate-email presentation, and pending state.
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.8_
  - [x] 4.3 Create `/auth/login` and `/auth/register` Server Component page shells and pass `redirectTo` to the forms.
    - _Requirements: 1.7, 2.4_

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Enforce `user_id` ownership in resource mutations
  - [x] 6.1 Implement the pure `checkOwnership(requestingUserId, recordUserId)` helper.
    - It permits only equal, non-null IDs and rejects un-migrated records.
    - _Requirements: 5.3, 5.4, 5.5_
  - [x] 6.2 Write property test for ownership checking (Property 6)
    - Create `src/lib/ownership.property.test.ts`; generate UUID/null pairs and assert true only for equal non-null IDs.
    - **Property 6: Ownership check correctness.**
    - **Validates: Requirements 5.3, 5.4, 5.5**
  - [x] 6.3 Update restaurant actions to authenticate, set `user_id`, and reject non-owner or Guest mutations.
    - `src/actions/restaurants.ts` obtains the current user server-side before every create, update, or delete database write.
    - _Requirements: 4.5, 5.1, 5.3, 5.4, 5.5_
  - [x] 6.4 Update offer actions to authenticate, set `user_id`, and reject non-owner or Guest mutations.
    - `src/actions/offers.ts` and `src/services/offers.ts` use the authenticated ID for inserts and ownership checks for update/delete.
    - _Requirements: 4.5, 5.2, 5.3, 5.4, 5.5_
  - [x] 6.5 Write property test for unauthenticated mutation rejection (Property 5)
    - Create `src/actions/resource-auth.property.test.ts`; mock `getUser()` as null for every restaurant and offer mutation and assert no database write occurs.
    - **Property 5: Server Actions reject unauthenticated mutation calls.**
    - **Validates: Requirements 4.5**
  - [x] 6.6 Write property test for authenticated `user_id` inserts (Property 7)
    - Create `src/actions/resource-creation.property.test.ts`; generate user IDs and valid resource data, then verify restaurant and offer inserts use exactly the authenticated ID.
    - **Property 7: user_id is stored on resource creation.**
    - **Validates: Requirements 5.1, 5.2**
  - [x] 6.7 Write focused mutation authorization unit tests
    - Cover owner success, another user's denial, NULL `user_id` denial, and fetch/system failures that must leave data unchanged.
    - _Requirements: 4.5, 5.3, 5.4, 5.5_

- [x] 7. Restrict resource-management controls to owners
  - [x] 7.1 Render restaurant and offer edit/delete controls only when the Server Component-provided viewer ID matches the resource `user_id`.
    - Guest viewers and non-owners receive no edit/delete controls.
    - _Requirements: 5.6_
  - [x] 7.2 Write property test for resource-control visibility (Property 8)
    - Create `src/components/resource-controls.property.test.tsx`; generate resource/viewer combinations and assert controls appear if and only if IDs are equal and non-null.
    - **Property 8: Edit/delete UI controls are only shown to the resource owner.**
    - **Validates: Requirements 5.6**

- [x] 8. Render NavHeader from verified server auth state
  - [x] 8.1 Convert `NavHeader` to an async Server Component with authenticated email/logout and Guest login/register variants.
    - _Requirements: 7.1, 7.2, 7.4, 7.5_
  - [x] 8.2 Write property test for authenticated NavHeader rendering (Property 11)
    - Create `src/components/NavHeader.auth.property.test.tsx`; generate authenticated users with non-empty email and verify email/logout are present while Guest links are absent.
    - **Property 11: NavHeader renders the authenticated user's email and logout button.**
    - **Validates: Requirements 7.1**
  - [x] 8.3 Write property test for NavHeader SSR/hydration consistency (Property 12)
    - Create `src/components/NavHeader.hydration.property.test.tsx`; compare server and client output for authenticated and Guest states and assert no hydration warnings.
    - **Property 12: NavHeader SSR and client render produce identical output.**
    - **Validates: Requirements 7.4**
  - [x] 8.4 Write auth-state transition UI tests
    - Assert the pending state renders Guest controls, and login/logout changes NavHeader within one second without a full browser reload.
    - _Requirements: 3.3, 7.2, 7.3, 7.5_

- [ ] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Complete anonymous-data migration failure handling and validation
  - [x] 10.1 Create the atomic `migrate_session_data` SQL RPC and nullable `session_token` transition migration.
    - The RPC updates only matching NULL-`user_id` restaurant/offer rows and returns migrated counts.
    - _Requirements: 6.2, 6.4, 6.5, 6.6_
  - [x] 10.2 Write property test for migration selectivity and field preservation (Property 9)
    - Create `supabase/tests/migrate-session-data.selectivity.property.test.ts`; generate mixed records and verify only `user_id` changes on matching unowned rows.
    - **Property 9: Migration updates only user_id on matching NULL records and leaves all other fields unchanged.**
    - **Validates: Requirements 6.2, 6.5, 6.6**
  - [x] 10.3 Write property test for migration atomicity (Property 10)
    - Create `supabase/tests/migrate-session-data.atomicity.property.test.ts`; inject a mid-operation database failure and assert the pre-call state is retained.
    - **Property 10: Migration is atomic — any database error rolls back all changes.**
    - **Validates: Requirements 6.4**
  - [x] 10.4 Invoke the migration RPC after successful registration or login and delete `lunch_session_token` only after a successful migration.
    - Failures are logged server-side without invalidating the authenticated Supabase session.
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x] 10.5 Finish migration-warning delivery without breaking successful auth redirects
    - Replace the current action-result/`window.location.href` branch in `src/actions/auth.ts`, `LoginForm.tsx`, and `RegisterForm.tsx` with a non-blocking, post-redirect warning mechanism that preserves the required destination and SPA NavHeader update.
    - Keep migration failures non-fatal and show exactly the required support message.
    - _Requirements: 1.6, 2.2, 6.4, 7.3_
  - [x] 10.6 Write Playwright coverage for post-auth migration
    - Seed matching and non-matching legacy rows, set `lunch_session_token`, authenticate, then verify ownership assignment, cookie deletion, unchanged non-matching rows, and the non-fatal failure message.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 11. Add database ownership schema and RLS migrations
  - [x] 11.1 Add nullable `user_id` foreign keys, ownership indexes, public-read policies, and owner-only mutation policies for restaurants and offers.
    - _Requirements: 5.1, 5.2_

- [ ] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP; all non-optional tasks are required to close implementation gaps.
- The Supabase Auth project must retain the design-specified 7-day inactivity expiry and 5-failures/15-minute rate-limit configuration. These are provider settings, not coding-agent tasks; the integration tests verify the application’s observable handling of those service outcomes.
- `session_token` compatibility files and columns remain only for the migration period. Removing them is intentionally outside this feature plan until production migration completion is confirmed.
- Every incomplete leaf task appears exactly once in the dependency graph. Test tasks use distinct files so tasks in the same wave can run in parallel.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.5", "2.2", "3.2"] },
    { "id": 1, "tasks": ["1.2", "1.4", "2.3", "2.4", "2.5", "3.3", "6.2", "6.5", "6.6", "6.7", "7.2", "8.2", "8.3", "8.4", "10.2", "10.3"] },
    { "id": 2, "tasks": ["3.4", "10.5"] },
    { "id": 3, "tasks": ["10.6"] }
  ]
}
```
