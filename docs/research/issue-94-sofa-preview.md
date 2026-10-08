# Issue #94: single-source local preview

This document records the initial read-only Sofa preview increment. It is
preparation for the 2–3-source pilot, not the five-business-day publication pilot.
The subsequent [Sushi Friends increment](issue-94-sushi-preview.md) adds a second
preview source; PROST remains unconfigured.
Approved publication is described in the subsequent
[stage-2 implementation](issue-94-approved-publication.md); the read-only
limitations below describe this initial increment.

## Configuration and operator flow

Set `SOFA_IMPORT_RESTAURANT_ID` to the reviewed Restaurant UUID in the target
environment. The configured record must be named `Sofa Lounge & Restaurant`
with address `al. Paderewskiego 35, Wrocław`. The source is disabled when the
UUID is absent or invalid; deleted or changed branches fail before fetching.
The Restaurant created locally by the operator is bound in the ignored local
environment file. No environment-specific UUID is committed as a default.

An Admin opens `/admin/import` and selects **Pobierz menu Sofa**. Both the page
and server action enforce the existing server-verified Admin check. Restaurant
reads use the session Supabase client and existing RLS, without a service role.
The source URL is hardcoded; the action accepts only the literal source ID.

The HTML fetch has a 10-second total deadline covering DNS and response body,
a 2 MB body limit, HTML-only content handling and no automatic retries. Only
the exact configured HTTPS URL is permitted, including at redirects; up to two
redirects are allowed. Every resolved IPv4 must be public, and a validated
address is pinned to the TLS request. IPv6-only sources are unsupported. The
adapter parses only the lunch category and strips scripts/styles. The action
checks the complete analyzer input, including Restaurant name and address,
against the shared 5,000-character limit. Longer inputs skip AI and return the
complete direct HTML preview with an explicit length warning; source evidence
and dishes are never truncated.
The extractor retains its shared 25-second deadline and existing rate-limit
fallback behavior. No browser execution, OCR or arbitrary URL fetching occurs.

The preview displays the authoritative Restaurant, source link, fetch timestamp,
menu excerpt and extracted dishes/prices/components. Missing or invalid prices
remain visible. Date is explicitly unknown: fetch time and weekday schedules
are not menu validity dates. AI dietary/allergen labels and weekday assignments
are excluded from the returned dish preview because they are not independently
verified source evidence. React renders source text as text, never HTML.

If the analyzer reports temporary unavailability, the preview uses Sofa's
structured HTML rows instead: literal item title, description and one explicit
PLN price. It labels the result as a direct website read, displays the AI
unavailability warning, and keeps the date unknown. Missing, multiple,
non-PLN, zero or qualified prices remain null; no alternate AI call or retry
is added. Other analyzer failures remain distinct errors. This fallback is
specific to the reviewed Sofa HTML structure, not a generic scraping heuristic.

Fetching errors, missing/empty lunch sections, AI failures and successful AI
results with no dishes are distinct outcomes. There is no publication action
or database mutation in this feature.

## Remaining gates

- Confirm current availability, dates, prices, alternatives and service channel
  with the operator before any publication.
- The second source/branch is now configured and locally verified in the Sushi
  increment. Enable environment-specific bindings before testing another deployment.
- Resolve PROST's later-day mapping or exclude it from the initial pilot.
- Stage 2 requires a separate increment: corrections, explicit date approval,
  database-enforced idempotency, safe partial-batch retries and local database
  authorization/concurrency tests. Existing publication behavior alone does not
  satisfy the import acceptance criteria.
- Run and record five business days of operator-reviewed imports on 2–3 sources
  before claiming the MVP pilot is complete.

The existing frozen corpus remains unchanged. Adapter tests restore structural
category/item wrappers around its captured Sofa excerpts; these wrappers are
synthetic test layout, not a new full-response capture.

## Local verification — 2026-10-08

- Full ordinary suite: 920 passed, 6 opt-in live tests skipped. Three additional
  UI tests passed separately after being added. The later provider-message
  regression and UI tests passed together (10 focused tests).
- Typecheck and production build passed; build retains existing unused-variable
  warnings in chat and OfferPreview. The dev server was stopped during build to
  avoid both commands writing the same `.next` directory.
- Headless Chromium exercised real local login, source fetching and live
  extraction. The successful run returned three distinct sets at 40.31 PLN,
  retained goulash/sour-cream and Kozacka/Classic alternatives, and showed an
  unknown menu date with source evidence. At 390 px there was no horizontal
  document overflow. No Lunch_Offer rows were created.
- An earlier real extraction returned provider HTTP 503. Minimal primary and
  alternate model probes subsequently returned HTTP 200, and full menu
  extraction then succeeded. This supports transient provider unavailability,
  not a guarantee of future uptime. The importer now preserves only allowlisted
  analyzer error messages so unavailability, timeouts and rate limits remain
  distinguishable; it does not add retries for 503 or change global fallback
  policy. A subsequent repeated 503 motivated the source-derived fallback above.
  Its action regression failed before the fallback and passed after it; 39
  focused import tests and typecheck passed. A direct live HTML adapter check
  returned all three 40.31 PLN sets without calling AI.
  A regression failed with the generic message before the earlier correction
  and passed afterward.
- The local `pilot@example.test` account was granted Admin access for this pilot.
  A separate temporary local QA account was created and deleted after browser
  verification. No remote account or production configuration changed.
