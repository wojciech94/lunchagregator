# Admin onboarding for bounded HTML pilots (#129)

The later [Meatologia image pilot (#134)](issue-134-meatologia-image-pilot.md)
reuses this source slot for one explicitly selected image-menu adapter. Its trial
calls image AI and displays image evidence. The generic HTML workflow below
continues to exclude images/OCR, PDF and JavaScript-rendered menus.

Base: fetched `origin/main` `15c9fcfa780af4090316c365fa6b2f00eb3a94f2`.

## Operator workflow

Open the existing Restaurant details as Admin. The existing Sofa/Sushi controls
remain available. The new HTML pilot section provides one generic source per
Restaurant, with stable identity `html-<Restaurant UUID>`:

1. Enter the official HTTPS menu URL and save an inactive draft.
2. Run a trial. Fetching never creates offers or calls AI. The source becomes
   inactive pending verification; fetched evidence, destination URL, literal
   items, fetch time and extraction/fetch limitations are stored in the binding.
3. Compare the Restaurant with the actual source title, addresses and menu
   excerpt. Independently check the full official page, exact branch, freshness,
   variants and sales channel. Write evidence and explicitly confirm there is no
   unresolved branch ambiguity before activating.
4. An active source uses the existing import preview and editable publication
   review. Fetch again; manually confirm an available date, correct/exclude
   uncertain items and deliberately approve publication. AI suggestions cannot
   establish branch identity, source authenticity or freshness.
5. Disable the source to prevent further publication. Existing offers remain.

Saving a draft, changing the URL or source identity, or running a new trial
invalidates verification and publication previews. Material Restaurant identity
changes disable its bindings and discard generic trials; reverting the edit does
not restore verification. Save the draft again to refresh identity before trial.
Formatting-equivalent Restaurant edits retain the existing normalization policy.
Trial activation requires a successful trial no older than 30 minutes, with the
database clock authoritative; disable requires another trial before reactivation.
Every binding write rotates its optimistic revision and is atomically audited.

## Deliberately bounded extraction

The generic extractor requires a lunch heading (`h1`–`h3`) inside one semantic
`section`, `article` or `main`. It reads leaf `li`, `tr`, `article` or
`[data-menu-item]` rows with a literal name in `[data-name]`, `h3`, `h4`, `th` or
`strong`. Names must be distinct; there must be 1–50 items and at most 12,000
characters of menu evidence. Prices require one literal PLN amount. Missing,
multiple or qualified prices remain null and need correction/exclusion.
Descriptions preserve alternatives rather than inventing a set composition.

Scripts, styles, templates, frames and hidden elements are excluded; no page
scripts or linked resources run. Multiple address elements or explicit
multi-location wording block generic activation. This is a conservative signal,
not comprehensive branch detection: the Admin still must inspect the full page.
Calendar dates in ISO or day/month/year numeric notation block this generic path
because it does not interpret weekly validity. Other unrecognized date wording
also needs human review; fetch time never proves menu freshness. PDF, image/OCR,
JavaScript-only and unsupported markup need a separate adapter or manual entry.
Unsupported/fetch failures remain explicit inactive trials, not an empty success.

For active sources, the existing AI analyzer may assist the publication preview;
literal HTML items still own retry keys and publication review. Complete input
over the analyzer limit uses the HTML fallback. No guessed dietary or allergen
metadata is published.

## Fetch protections

The separate generic fetcher preserves the fixed-source fetcher's exact-URL
allowlist. Generic URLs require HTTPS on the default TLS port, a DNS hostname,
no credentials or fragment, and a maximum length of 2,000. IP literals and local
hostname suffixes are rejected. Every initial/redirect destination receives its
own DNS lookup; all returned IPv4/IPv6 results must be public. Private, loopback,
link-local, multicast, documentation, mapped IPv6 and other special-purpose
ranges are rejected. IPv6 is limited to global unicast outside reserved subnets.

Each request pins one validated address with a custom lookup and explicit IP
family, creates no reusable agent, retains TLS hostname verification, and checks
the connected peer before consuming the response. A second DNS lookup cannot
rebind it. Redirects are limited to two and revalidate URL/DNS/peer each time.
One 10-second deadline covers DNS, redirects and response reading. Only HTTP 200
uncompressed `text/html` is accepted, with a streamed limit of 2 MB. Fetching does
not follow links, images, scripts or menu-internal requests.

The family option matters because Node's automatic family selection can request
an array from a custom lookup; an explicit family pins the single-address callback
contract. See [Node net documentation](https://nodejs.org/download/release/latest-v20.x/docs/api/net.html)
and [DNS documentation](https://nodejs.org/api/dns.html).

## Database, authorization and retry identity

Apply `20261009000002_generic_html_import_sources.sql` after the #128 migrations
before deploying this UI. It adds bounded trial metadata and extends bindings and
linkage to Restaurant-anchored generic source IDs. Existing fixed definitions,
publication RPC and idempotent offer transaction remain in use. All binding IDs
and Restaurant anchors are immutable, including direct Admin writes. Generic
trial data is shape-checked; activation independently checks supported items,
limitations and age. The action requires `getAdmin()` and validated input; the
invoker RPC independently requires Admin and existing RLS protects binding rows.

As in #123/#128, Admin-reviewed metadata is trusted, not a signed proof that a
particular network response was fetched. A privileged Admin can submit trial
metadata through the API. Untrusted page or AI output cannot invoke activation;
ordinary authenticated users cannot bypass either authorization layer.

The namespace remains stable through URL edits. Item keys use normalized literal
titles, never AI output, price, descriptions, fetch time or reviewed corrections.
The existing Restaurant/source/item/date unique key preserves concurrent retries,
manual corrections, changed dates and deletion tombstones. A renamed literal
source item is a new identity and needs operator review before publication. This
does not deduplicate independently configured fixed and generic sources against
each other; do not configure a second source for the same menu to reimport it.

## Validation and deployment status

- New focused checks: 50 unit/action/UI tests passed, including hostile DNS,
  redirects, connected-peer mismatch, deadlines, non-HTML/oversize responses,
  unavailable sources, unsupported/stale/ambiguous HTML and stable retry keys.
- Full unit/property checkpoint: 1,091 passed, six opt-in live cases skipped.
- Full real-database checkpoint: 125 passed. Subsequent binding hardening was
  verified again with the affected generic/fixed lifecycle and publication suites.
- Typecheck and lint passed; lint retains two existing unused-variable warnings.
  Production build passed before the final small identity/metadata hardening;
  affected tests and typecheck verify those refinements.
- T3 browser QA used a temporary local Admin and Restaurant. Actual `example.org`
  fetching displayed unsupported HTML evidence and no activation control. A
  clearly labelled supported QA trial fixture then verified explicit activation,
  preview controls and disabling. Unsafe HTTP/loopback draft was rejected. This
  does not claim a live supported restaurant or AI integration evaluation.
- Temporary QA account, Restaurant, binding and audit fixtures were removed.
  Existing local pilot data (two Restaurants, three offers) was preserved.

Implementation does not authorize merge, production migrations, deployment,
scheduling or production publication. New real restaurant sources still require
Admin branch/freshness confirmation and a measured pilot. #94 remains independent.
