# Meatologia image-menu pilot (#134)

Base: fetched `origin/main` `5cab9fb3978f0ff657db7d42a05166fd398d2ec6`.

## Admin workflow

Use an existing Restaurant named Meatologia (a branch suffix is allowed) at
`ul. Pawła Włodkowica 27, 50-072 Wrocław`; the postal code and the first name
`Pawła` may be omitted. This is a narrow alias for Włodkowica 27 in Wrocław,
not fuzzy branch matching; other house numbers and cities remain rejected.
In Restaurant import settings choose **Wybierz pilot Meatologii — Włodkowica 27**,
save the draft and run the image-menu trial. The adapter finds exactly one card
by its branch title/address and follows its **Menu lunch** anchor. Card order
and the main-menu PDF are irrelevant. Asset URLs are rediscovered on every fetch.

The image analyzer supplies editable dish names, descriptions, prices and stated
availability. A failed/empty/ambiguous extraction produces an unsupported trial,
with no activation control. A missing price remains null for correction at
publication. The trial never creates offers. Its original asset link, content
hash, fetched time, branch evidence and machine transcription are visible.
Remote links can change their content; the active publication preview also shows
the exact downloaded bytes as an image for comparison.

AI failures retain the application's safe classified message (rate limit,
25-second timeout, configuration, invalid output or temporary unavailability).
Raw provider errors are not displayed; failures are not cached. For a deployed
failure, inspect server logs for `AI extraction failed` and its allowlisted
`kind`/`statusCode`. Configuration failures require checking the deployment's
Google API key/model access; a repeated trial cannot fix that configuration.

Compare the branch and actual image, establish menu freshness independently,
and record explicit verification evidence before activation. Fetch an active
preview, correct or exclude uncertain dishes, choose an available date and
explicitly approve publication using the existing review form. Stated weekdays
and hours are evidence, not a new recurrence rule. Neither fetch time nor the
filename `07_2026` establishes today's availability or a validity month.

## Identity, caching and authorization

This adapter uses the existing `html-<Restaurant UUID>` binding: one generic
source slot per Restaurant, with existing RPC/RLS, Admin action checks, binding
revisions, 30-minute trial/preview freshness, disable, audit and Restaurant-edit
invalidation. Saving a new draft or trial invalidates prior activation/previews.
There is no second source identity when the image URL changes.

Each fetch downloads and validates the current bytes. Successful, validated AI
extraction is cached in the Next.js Data Cache by SHA-256 plus extraction-version
key, without time-based revalidation. Failed analysis is thrown and not cached.
Cache hits still receive a new fetch timestamp; they never attest freshness or
skip human date confirmation. A cache may be evicted by the runtime/deployment,
so a later AI call can still be necessary.

Retry keys come from the normalized names transcribed from the image, not from
Admin-edited form values, image URL or chosen date. Existing source/item/date
deduplication preserves manual corrections and deletion tombstones, and permits
explicit publication for a new date. OCR names are untrusted: if a changed image
or fresh model analysis reads a name differently, compare existing offers before
approving it as a new item. AI does not create or identify Restaurants, establish
validity dates, or certify dietary/allergen claims.

## Transport and deployment

- Direct HTTPS fetches; no browser clicking, cookies, Meta account or scraping service.
- Discovery is restricted to `https://meatologia.pl/pages/nasze-lokale`.
- Assets must be JPEG/PNG under the exact Shopify store's `/files/` path; every
  redirect is checked against the same origin/path policy before DNS/request.
- Shared protected transport validates every DNS result, pins the selected
  address, retains HTTPS certificate verification, and verifies the connected
  peer. Private/reserved IPv4/IPv6 destinations are rejected.
- Each fetch has a 10-second deadline, two redirects and a streamed 2 MiB limit;
  status/type/content-encoding must match the requested resource.
- Sharp validates type and fully decodes a single image, bounded to 6,000 pixels
  per dimension and 10 million pixels. PDF, animated, malformed and mislabeled
  images are rejected. Sharp is now an explicit runtime dependency, using the
  version already present through Next.js.
- Existing Gemini configuration, fallback and shared 25-second AI deadline apply.
  Image bytes are passed to the provider; the provider does not fetch the CDN URL.
- No new SQL migration. Existing migrations through `20261009000002` are required.
  Deploy application/dependency changes together. No sources activate on deploy.

Only this branch and JPG/PNG lunch menus are supported. Generic sources still
reject images/PDF/JS; PDF support, other branches, scheduling and automatic
publication are separate future work.

## Validation evidence

- Post-merge pilot diagnostics follow-up: the reported abbreviated address and
  lost AI failure classification reproduced as seven failing regression cases.
  After the fix, 43 focused adapter/action/provider tests passed, including real
  SDK HTTP 400/503 classification, safe-message filtering, failed-analysis retry
  and rejection of other house numbers/cities. Typecheck and affected ESLint passed.
  The reported Vercel provider failure remains undiagnosed until its sanitized
  server-log classification is available; this fixes visibility, not credentials
  or provider availability. Existing UI displays the saved trial limitations.
- Full unit/property suite: 1,114 passed, seven opt-in live tests skipped. Focused
  adapter/transport/action/provider/UI suite: 95 passed. Typecheck and affected
  ESLint passed; production build passed with the two existing unused-import warnings.
- Real local database: seven generic/image-source lifecycle cases passed, covering
  guest/regular denial, direct RLS denial, unsupported/inactive state, explicit
  activation, corrections, asset URL changes, new dates and tombstones.
- Opt-in live source fetch on 2026-10-09 at 17:46:23Z downloaded and decoded
  `lunch_07_2026.jpg?v=1784199410`, SHA-256
  `a04611685d536ed19dd7caec7861fdb9f414e323cc086004618d7b1fb469a5b8`.
  Provider output was deliberately mocked; this is transport/image evidence,
  not live AI extraction quality or current menu availability.
- No live provider key is configured in the local environment. Provider request
  tests verify inline image bytes and availability/instruction handling. Actual
  AI quality, production branch verification and first approved offers remain
  human pilot work after deployment.
- Collaborative T3 snapshots twice timed out after 15 seconds; the alternative
  browser surface failed to initialize. Local Playwright passed draft save, real
  image fetch, missing-provider error and activation denial, then image evidence,
  explicit activation and disable on a clearly labeled simulated trial fixture.
  All temporary QA identities, Restaurants, bindings and audit rows are cleaned.

No production writes, migrations, activation, publication or scheduling occurred.
