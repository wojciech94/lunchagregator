## Problem and approved outcome

A restaurant can mark its menu as recurring, yet visitors cannot see next Monday's menu without an explicit weekly renewal. The current implementation follows #71 / Requirement 8.7: `menu_recurs_weekly` is only an intent marker and automatic renewal is explicitly excluded. This issue intentionally replaces that product decision.

**Publish once; change the menu only when it changes.** Owners manage a single recurring schedule, while visitors browse ordinary dated Lunch_Offers. No weekly renewal or mandatory weekly confirmation is required.

The user approved the product recommendation on 2026-10-09. Implement the complete first release below, with a simple responsive interface informed by the reviewed interactive publication preview.

## Evidence

Read-only checks on the database configured in the investigating checkout (not independently identified as production):

- Pizza Si has `menu_recurs_weekly = true` and weekday offers for October 5–9, 2026, but none for October 12. Its Monday source is “Pizza Salami Napoli + Napój”.
- Sushi Friends Bar & Resto has the flag and four lunch offers dated Friday, October 9 only. Their publication date does not establish their actual recurring availability.
- `get_offers_filtered` accepted `p_date = '2026-10-12'` without error and returned zero rows even without optional filters. Its exact-date predicate has no recurring-menu projection.
- The existing renewal planner shifts source dates by seven days. Pizza Si would produce October 12–16; the observed Sushi Friends sources would produce Friday, October 16 only.
- The current seven-day selector includes October 12 when browsing October 9, but cannot reach next Monday when browsing on a Monday.

This is a missing product capability, not an extraction-weekday calculation fix.

## Publication experience

Preserve photo/text/link extraction, manual entry, restaurant-first assignment and the existing dish fields. Put recurrence in the publication preview, rather than requiring owners to discover a separate restaurant setting afterwards.

1. Choose **“Only for these dates”** or **“Repeat automatically”**. Recurrence must be an explicit choice; do not silently make imported dated menus permanent.
2. When repeating, choose one of two shapes:
   - **Same menu on selected days:** one dish list with Monday–Friday suggested; all seven days remain editable and the owner sees/confirms the selection.
   - **Different menu for each weekday:** weekday sections with assigned dishes. Empty days publish nothing. Allow copying dishes to another day without retyping.
3. Start date defaults to today. Display the actual applicable days and **“Repeats every week until you stop it”**.
4. Show a live preview for the coming week, including next Monday, and use **“Publish menu”** as the primary action. On failure retain all form data and allow retry. Only report success after the schedule and immediately browsable offers are ready.

Use the same dish editor for both shapes. Suggest the weekday shape when extraction provides weekdays; suggest the fixed shape when it does not. Suggestions are editable and never override explicit dates or publication choice. Do not expose background jobs, copies, generation horizons or versioning in product copy.

### Interface reference

The accepted preview used a compact form with a clearly labelled checkbox, a native schedule selector, wrapping weekday controls and a live date-specific menu preview. Polish product copy can follow this structure:

```text
Publikacja menu

[x] Powtarzaj automatycznie

Jak obowiązuje menu?
[To samo menu w wybrane dni              v]
  or: Inne menu na każdy dzień tygodnia

Dni z lunchem
[x] Pon.  [x] Wt.  [x] Śr.  [x] Czw.  [x] Pt.
[ ] Sob.  [ ] Niedz.

Obowiązuje od: [date]
Co tydzień, do odwołania.

Podgląd: Poniedziałek, 12 października
Lunch I                         [actual price]
Lunch II                        [actual price]
...

[Opublikuj menu]
```

Adapt this reference to the repository's existing components and visual language; it is a behavior/layout reference, not production HTML to paste. Keep controls accessible by keyboard, labelled for assistive technology and comfortable on mobile. Days wrap without horizontal overflow. Make the selected dates, prices, validation failures and publication status visible.

## Owner management and availability rules

- Add **“My menus”** as the primary management view for this feature: one restaurant card with status, weekdays and menu summary. Keep dated offers/history accessible without flooding the main view with generated copies.
- Actions: **Edit menu**, **Skip a day**, **Stop repeating**. Replace the weekly renewal action once a schedule is active; manual duplication may remain for one-off menus.
- Editing applies from today by default; allow a future effective date, including next Monday. Old served dates retain their dishes, prices and snapshots. Removed dishes must also disappear from future generated occurrences.
- A date exception offers **“No lunch on this day”** or **“Different menu on this day”**. Replacement supplies the entire effective lunch menu for that restaurant/date, rather than mixing old and new recurring dishes. Removing an exception restores the normal schedule.
- Precedence for a restaurant/date: **No lunch → replacement menu → normal dated/recurring offers**. Closure hides every lunch offer for that date. Replacement is the explicit complete menu for that date; independent offers remain stored but must not accidentally appear alongside it. Without either exception, unrelated one-off offers remain independent and visible.
- Stopping repetition immediately withdraws that schedule's generated offers for today and future dates, including their public detail URLs. Preserve history and independent dated offers. Date-specific replacement menus remain explicit dated publications; show remaining future exceptions in the stop summary.
- Provide a convenient undo/re-enable path; show any surviving exceptions before reactivation. Avoid repeated confirmation dialogs for ordinary edits.

## Visitor experience

- Keep existing offer cards, prices, search, cuisine/dietary/distance filters and detail routes. Recurrence does not require a separate browsing mode.
- Extend browsing to a rolling **14-day** selector with an obvious **“Next week”** shortcut and an absolute selected-date heading. Direct date links work within the publication horizon.
- Restaurant detail shows the selected day's effective menu and explicitly shows **“No lunch on this date”** for a closure exception.
- A small recurring-menu label is optional. “Updated on …” reflects a real owner menu edit, not daily generation. Do not imply fresh restaurant confirmation merely because offers were generated automatically.
- Surface operational errors separately from a legitimate empty menu.

## Implementation constraints: deliberate code, small interface

Persist the recurring schedule as the source of truth and materialize ordinary dated `lunch_offers`. Preserve existing IDs and the current listing/detail model; do not introduce virtual offer IDs or a second client-side listing implementation.

### One module owns recurrence behavior

Create a **deep module** with a small interface for schedule publication/change, exceptions, stopping and horizon reconciliation. Its implementation owns effective revisions, dates, precedence, generation provenance and reconciliation. Owner actions and the daily runner use this module; neither reimplements the recurrence rules.

Keep deterministic planning free of I/O and ambient clocks: accept the applicable business date explicitly and return a plan. Perform database changes through the repository's established access patterns. Introduce a seam or adapter only where a real dependency varies; avoid speculative repositories, generic scheduling frameworks, pass-through layers and a public method for every internal step. Prefer explicit domain types and discriminated schedule/exception variants over loosely related booleans and invalid state combinations. Validate action inputs with Zod and critical invariants in PostgreSQL.

### Generation, concurrency and visibility

- Materialize **30 calendar dates including today** on publish/edit/activation. Maintain that rolling horizon daily. A Monday-only job is insufficient: future Monday must be visible before it arrives.
- Publication must synchronously make its immediate horizon available. Persist schedule changes and reconcile affected occurrences transactionally, or publish through an atomic activation seam so partial revisions never become visible.
- Give schedule entries stable identity. Enforce uniqueness for an occurrence's schedule-entry/date in PostgreSQL, rather than using dish names as identity or relying on check-then-insert. Price/name edits must not create duplicate occurrences.
- Prevent a stale background run from restoring a removed dish, stopped schedule or replaced date after a concurrent owner edit. Make reconciliation revision-aware and serialized/atomic at the schedule's seam. Cover stop/edit versus worker races in database tests.
- Record schedule origin/effective revision separately from extraction `source_type`. Preserve imported fields and existing allowed source types. Never identify generated offers solely by matching dish names.
- Reconcile only the affected effective dates and owned generated rows. Preserve past history and independent one-off offers. Retry safely without delete-and-reinsert churn for unchanged occurrences or broken stable links.
- Listing, totals, pagination, restaurant details and individual offer visibility must share the effective availability rule, including exceptions and withdrawal. Do not independently implement different filters for each caller.
- Make the business calendar explicit. For this Polish first release, use `Europe/Warsaw` consistently for effective dates; do not let browser/server timezone or an ambient UTC date shift weekdays. Check compatibility with the existing database insert-date trigger, including midnight and daylight-saving transitions.
- Preserve the Snapshot invariant: do not rewrite served offer snapshots. Newly created occurrences take appropriate current restaurant metadata through existing conventions, without a geocoding request for every generated dish.

### Authorization and operations

- Owner-facing actions retain both `getUser()`/ownership checks and RLS. Do not weaken either layer to support generation. Keep established admin behavior/auditing consistent.
- The scheduler uses a narrowly scoped internal entry point; any elevated credentials remain server-side. A public request cannot impersonate an owner or choose arbitrary accounts for generation.
- Configure the actual persistent daily runner and document its deployment prerequisites; an unconfigured job or development-only timer is not a completed feature. Use bounded batches, failed-run visibility and idempotent retries. A pre-generated horizon gives recovery time during an outage.
- Do not add email reminders, mandatory weekly confirmations, seasonal rule builders or multiple simultaneous recurring schedules per restaurant in the first release.

## Transition and specifications

- Update Requirement 8.7, the lunch-aggregator design, `GLOSSARY.md` and relevant interface copy. Explicitly record that the no-automation decision from #71 is superseded for activated recurring schedules.
- Provide a one-time **“Enable automatic repetition”** setup for existing flagged restaurants: prefill a reviewed coherent menu, require schedule confirmation and preview future dates before activation.
- Do not reinterpret all old flags as active automatic schedules. Do not infer fixed-menu weekdays from the date a menu was imported. For Sushi Friends, require an explicit weekday decision.
- Avoid two writable sources of truth: retire or derive the old flag for activated schedules, with an explicit compatibility path for pending legacy setup.
- Activation preserves existing dated offers and explicitly reconciles overlapping future menu occurrences so duplicates do not appear. Do not silently adopt unrelated offers as generated records.
- The reviewed supporting files in the local checkout are `docs/qa/recurring-menu-product-recommendation.md`, `docs/qa/recurring-menu-preview.html` and `docs/qa/weekly-menu-next-monday-analysis-2026-10-09.md`. They are local artifacts at issue creation; this issue is self-contained and must not depend on those files already being published.

## Acceptance and meaningful validation

- [ ] Publish a Pizza Si-style weekday schedule on October 9, 2026: October 12 immediately shows Monday's dish, price, correct filter matches and a working detail link without renewal.
- [ ] Publish the fixed four-dish menu for Monday–Friday: all dishes appear on October 12, none on Saturday unless selected. Friday-only mode remains supported.
- [ ] From a Monday, next Monday is selectable; URL navigation/reload preserves the date and filters on mobile and desktop.
- [ ] Edit a price effective October 12: October 9 history stays unchanged; future applicable dates use the new price. Removing a dish withdraws its future generated occurrences only.
- [ ] A closure exception hides all restaurant lunch offers for its date; adjacent dates are unchanged. A replacement shows exactly its menu; removing it restores the schedule. Counts and detail visibility agree.
- [ ] Stopping repetition withdraws current/future generated offers, including existing detail URLs, without erasing history or independent dated menus. Re-enable makes surviving exceptions clear.
- [ ] Repeated publication/generation, concurrent runners, and owner edit/stop versus worker races produce no duplicates, stale resurrection or partially visible menus.
- [ ] Generation advances the horizon across several weeks without owner action. Failed execution is observable and recoverable through a bounded, idempotent retry.
- [ ] Existing flags migrate through confirmed setup without assumed weekdays, duplicate menu rows or conflicting status controls.
- [ ] Unit/property tests exercise the deterministic planner through its interface: weekday shapes, revisions, date bounds, exceptions and stable occurrence identity. Do not add tests that merely mirror implementation details.
- [ ] Real local Supabase tests verify uniqueness, transactions/concurrency, authorization/RLS, exception precedence and agreement between RPC listing/count/detail behavior. `npm test` mocks Supabase and cannot prove these.
- [ ] Focused Playwright coverage verifies publish → browse next Monday → edit/skip/stop, including a narrow viewport and keyboard use. Test fixtures must be isolated and must not publish into a shared production database.
- [ ] Appropriate type checks, build and targeted unit/DB/E2E suites pass. The deployment includes a configured daily runner and a documented failure/recovery path.

Related: #71 (manual refresh loop being extended). Existing one-off offers and the separate restaurant website importer remain supported; this issue does not authorize automatic extraction or guessing restaurant opening days.
