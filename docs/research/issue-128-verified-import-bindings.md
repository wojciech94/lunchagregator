# Verified import source bindings (#128)

## Behavior

An Admin configures import from an existing Restaurant detail page. The two
supported sources remain Sofa and Sushi Friends with fixed official URLs and
their existing HTML adapters. The central import page lists database bindings;
it no longer renders unbound catalog entries as if they were Restaurants.

The Admin sees the current Restaurant and expected source branch side by side,
opens the official website, records verification evidence (10–1,000 characters),
and explicitly confirms that the menu applies to this exact branch. Differences
produce a warning. An ambiguous or unrelated source must remain inactive.
Human confirmation is trusted Admin input, not automated proof of authenticity.
The source picker alone cannot activate import. Matching text does not bypass
confirmation either. No menu is published by configuration.

`lunch_import_bindings.restaurant_id` references the Restaurant UUID. Formatting
differences do not lose this relationship. Comparison normalizes Unicode NFKC,
case, periods/commas, whitespace and `ul`/`ulica`/`al`/`aleja` prefixes. It does not
correct typos or infer equivalence of different street numbers, missing cities,
or changed names. An Admin can explicitly explain a typo during verification;
the reviewed Restaurant snapshot is stored separately from the expected source.

A meaningful name/address edit disables verification, even if later reverted.
The UUID relation and prior verification evidence remain. Formatting-equivalent
edits retain verification. A new confirmation records the authenticated Admin,
database timestamp and current Restaurant/source snapshots.

Every binding write generates a new UUID revision. Preview metadata includes
that revision; server publication and the invoker SQL function independently
require the current active revision, current Restaurant and source snapshots.
Disable/re-enable or re-verification therefore rejects all earlier previews,
including retries of existing items. A new preview can safely return the existing
offer and preserve corrections using the unchanged Restaurant/source/item/date
identity. Disabling configuration does not delete offers or import tombstones.

Each fixed source has one binding. A source already assigned elsewhere cannot be
silently moved from another Restaurant. Disable it at its assigned Restaurant;
this stage retains the association. Deliberate reassignment/removal is not exposed
in this first-stage UI. Restaurant deletion cascades its binding and preserves
the existing Restaurant deletion behavior for offers/linkage.

## Rollout

1. Inspect migration history and apply predecessors, including Admin roles and
   `20261008000000_create_lunch_import_items.sql`, before
   `20261009000001_audit_lunch_import_bindings.sql`. Use the environment's
   normal reviewed migration procedure. Do not reset a database containing data.
2. Deploy the matching application. The migration removes the legacy publication
   RPC signature, so old clients fail closed. Discard pending previews and refetch.
3. Open the correct existing production Restaurant detail as Admin. Confirm
   branch identity, official source and evidence; activate the supported source.
   UUIDs come from the current Restaurant automatically.
4. Repeat for the other selected Restaurant. Verify preview and publication
   readiness before resuming the five-business-day #94 pilot. The user approves
   actual offers; development QA is not production pilot evidence.

No rows are activated by migration. Legacy `SOFA_IMPORT_RESTAURANT_ID`,
`SUSHI_IMPORT_RESTAURANT_ID`, branch-address overrides and signing secret are
ignored. They can be removed from the deployment environment after transition.
No per-Restaurant Vercel configuration or redeploy is needed after rollout.

The table enforces RLS for Admin read/write, a Restaurant foreign key and source
uniqueness. Configuration and publication RPCs independently check Admin. The
configuration trigger stamps current data and actor/time; the Restaurant trigger
can only invalidate bindings, allowing ordinary owners to edit their Restaurant
without gaining source-verification privileges. The application uses session
clients, never service-role clients.

Source catalog changes need a migration updating `import_source_definition`
together with the fixed code catalog/fetcher. Stored URL/name/address snapshots
must match both catalogs; changes fail closed pending renewed confirmation.

## Disable and rollback

Use **Wyłącz import** at Restaurant details to stop future imports. Previously
saved offers and corrections remain. Re-enabling requires confirmation/evidence
and a new preview. Do not downgrade only the application to the environment-based
version: its old RPC no longer exists. Prefer keeping this additive migration
and disabling sources until a reviewed forward fix is delivered. No destructive
data migration or automatic production configuration is part of this change.

## Follow-up

### Activation audit history

Migration `20261009000001` extends the existing append-only Admin log to binding
creation, updates and deletion. A database trigger writes the authenticated Admin,
timestamp and complete before/after states in the mutation's transaction, including
direct Admin writes and cascaded Restaurant deletion. The log's `record_id` is the
Restaurant UUID; snapshots include the source ID, revision and verification evidence.
Re-confirming or disabling never removes previous evidence. `/admin/logs` displays
the actor and expandable binding snapshots and links to the Restaurant.
Account deletion retains history with a null actor, matching the existing FK's
`ON DELETE SET NULL` intent; snapshots retain the original verifier UUID. Ordinary
owner edits and service-role maintenance are not Admin actions and do not create
Admin log entries. Existing Admin read/insert-only RLS is unchanged.
Apply both #128 migrations before deploying the matching application.

#129 covers new Admin-entered HTML sources and the additional fetching/extraction
controls they require. It does not block #94 on its two supported sources.
Scheduling, OCR, browser extraction and automatic publication remain outside this
stage. An undated menu still requires explicit date/availability confirmation.

## Implementation verification (2026-10-09)

- Review follow-up adds atomic append-only binding auditing. The final import
  database suite passed 16 tests; the existing audit suite passed 10 tests.
  Six focused audit/action/log-view unit tests, typecheck and affected lint passed.
  Existing import/UI/build evidence below remains applicable to unchanged flows.

- 41 focused action, identity and UI tests passed on the final implementation.
- The full unit/property run had 1,039 passes, six opt-in skips and one unrelated
  NavHeader hydration timeout under concurrent local workload. Its unchanged
  suite passed separately (1 test, 1.39 seconds). Hosted current-head CI remains
  the delivery gate; this is not claimed as a clean full local run.
- The full real-database suite passed 117 tests before the final normalization
  tightening and verifier-account-deletion guard. The final focused import suite
  passed 14 tests, including application/SQL normalization parity, ordinary-owner
  invalidation and verifier deletion. Other unchanged database contracts reuse
  the full-suite evidence.
- Typecheck and lint passed; lint retains two unrelated unused-variable warnings.
  Production build passed before the local normalizer refinement, which was
  subsequently covered by focused tests and typecheck. No routing/import/build
  configuration changed after that build.
- The final migration was reconstructed atomically from the preceding RPC
  contract and recorded on the existing local database without a reset. Original
  pilot data remained at two Restaurants, three offers and three linkage rows.
- Collaborative-browser QA used a temporary local Admin and separate Restaurant.
  It checked discrepancy warnings, disabled activation without confirmation,
  evidence/confirmation/activation through the real server action and RPC,
  active-source listing and disable removing preview controls. The temporary
  account/Restaurant/binding were removed; a guest view showed no Admin settings.
  No offers were published in browser QA and no live AI verification was added.

The host reserved port 54321, so this worktree uses a task-owned local HTTP proxy
on 55321 to the existing Supabase gateway. This is local verification setup, not
a production dependency or repository configuration change.
