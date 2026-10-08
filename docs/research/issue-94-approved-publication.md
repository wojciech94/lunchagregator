# Issue #94 — approved import publication (stage 2)

## Behavior

Sofa and Sushi Friends retain their independent fetch/AI previews. A separate
review form uses literal HTML items, preserving source alternatives and prices
without trying to match unstable AI names/order to source identities. The Admin
can select items and correct names, PLN prices, descriptions and set components.
Missing/ambiguous prices require a correction or exclusion before publication.
No inferred cuisine, dietary tags or allergens are published.

The date starts empty. These two sources supply no explicit calendar date; the
operator must confirm availability for the selected date and approve names,
prices, alternatives and sales channel. Dates must be real calendar dates from
today through 30 days ahead. Import review, the offer service's import path and
the database use the same UTC calendar, including around local midnight.
Ordinary offer forms retain their existing date convention. No weekday-to-next-week
mapping or automatic renewal occurs. Explicitly dated sources remain outside
the configured two-source scope and require a source review before enablement.

Changing an item or the date clears approval. After the first publication
attempt, the date stays fixed for retries; another date requires a new preview.
Saved items become read-only and link to their existing offers. Failed items
remain editable and selectable. A retry sends only items not yet confirmed saved;
after a lost response, repeating the same request remains safe through database
idempotency. A fully invalid request writes nothing; valid batches report every
individual save/failure, including a batch where every database write failed.

## Provenance and authorization

The server signs source ID, exact Restaurant ID/name/address, fetch time and
source-item keys with HMAC-SHA256. Source keys hash normalized literal titles,
independently of reviewed names/prices/descriptions. Receipt integrity, current
source binding, membership, unique keys and a 30-minute lifetime are rechecked
before saving. Missing/duplicate source titles disable publication for that
preview. A title renamed by the source is a new identity; the operator must
review that change before approving it.

Both actions require `getAdmin()`. Publication re-reads the Restaurant using the
session client. `createOffer` retains its Zod validation, authoritative Snapshot
mapping, coordinate reuse/geocoding and missing-coordinate warning. Its optional
import path calls an atomic SQL function instead of a plain insert; ordinary
offer creation is unchanged. SQL takes the final Restaurant Snapshot under a
row lock, sets the actor from `auth.uid()`, and requires Admin independently of
RLS. No service-role client is used by the application.

`lunch_import_items` is a minimal linkage table, not an import-run history. Its
primary key is Restaurant + source + source item + approved date, across all
operators. The function claims that key and inserts the offer in one transaction.
Concurrent claims wait on the primary key and return the saved offer unchanged.
A failed offer insert rolls back the claim. Manual name, price, description and
date corrections are never overwritten; a reimport also recognizes a manually
moved offer on its current date. Removing an offer retains its linkage tombstone
and reports that it cannot be recreated automatically. Removing a Restaurant
removes its import linkage alongside the existing unlink/Snapshot behavior.

Linkage reads/writes require Admin through RLS; authenticated callers have no
DELETE grant, preserving import identities and tombstones. RPC execution is granted
only to authenticated callers. RPC also enforces Admin, current binding,
date range and preview age. Public offer reading follows existing policies.

## Deployment and local setup

Apply `20261008000000_create_lunch_import_items.sql` before enabling publication.
Configure the existing environment-specific Restaurant bindings and a private
`LUNCH_IMPORT_SIGNING_SECRET` of at least 32 random characters; generate it
independently in each environment and never expose it through `NEXT_PUBLIC_*`.
Without the secret, previews work and publication stays unavailable. Changing
the secret invalidates pending receipts. Local configuration is ignored by Git.

The old weekly-menu migration shared version `20250101000005` with Admin roles.
It is now `20250101000009_add_menu_recurs_weekly.sql`, retaining its idempotent
`ADD COLUMN IF NOT EXISTS`. Existing databases whose latest migration is newer
may need `supabase migration up --local --include-all` for this backfill. Inspect
migration history and confirm `public.is_admin()` exists before rollout on an
environment that previously applied the colliding weekly-menu file instead of
the Admin migration. This implementation does not reset or change remote data.

## Verification and pilot

Unit/UI tests cover receipt integrity, expiration/binding changes, missing
configuration, approval/date/price validation, forged/duplicate items, partial
results, approval reset and retry payloads. Real-database tests cover simultaneous
operators, retained corrections/Snapshots, rollback/retry, RLS, date/age/binding
refusal, deleted-offer tombstones and manual date corrections.

Local browser QA uses a temporary Admin and temporary Restaurant binding;
the original pilot Restaurant rows and offers are preserved. QA verifies fetch,
correction, explicit approval, publication and reimport after a manual correction.
Temporary rows/account and configuration overrides are cleaned up afterward.
This is a functional check, not the five-business-day pilot.

Final validation on 2026-10-08: 1,018 unit/property tests passed (6 opt-in live
cases skipped); 112 real-database tests passed, including 7 import publication
cases and denial of direct linkage deletion; typecheck and production build
passed. Build retains existing unused-variable warnings in chat/OfferPreview.
In the collaborative browser, Sofa's unavailable-AI fallback
still allowed approved publication of one temporary QA item at a corrected
29.50 PLN. After a manual correction to 28.25 PLN, reimport returned the same
offer ID with that price, corrected name and description intact. Sushi's review
form showed 31/36/41/31 PLN and preserved miso/wakame choices; no Sushi offers
were published during QA.

The pilot remains pending. Run it on the two reviewed sources in the agreed
environment with an authorized operator for at least five business days. For
each run record:

| Date/source | Reviewed items | Date/price accuracy | Operator corrections | Saved/existing/failed | AI usage/error notes |
| --- | --- | --- | --- | --- | --- |

Record source freshness, alternative/surcharge/channel decisions and exact saved
offer links. Count analysis attempts and use provider usage figures when available;
character length alone is not a token/cost measurement. Report duplicates and
incorrect-date publications explicitly. Do not mark MVP/pilot acceptance complete
from automated tests or a single-day sample.
