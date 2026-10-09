# Recurring menus: simplicity and convenience

Status: product recommendation, not an implemented feature.
Prepared on 2026-10-09 following the [missing Monday investigation](weekly-menu-next-monday-analysis-2026-10-09.md).

## Recommended experience

The owner publishes a menu once, enables automatic repetition and changes it only when the restaurant's offer changes. Visitors choose a date and see the applicable dishes and prices through the existing browsing experience. Nobody needs to renew an unchanged menu each week.

Offer two publication choices: **“Only for these dates”** and **“Repeat automatically”**. Recurrence is an explicit choice, not enabled by default for every imported menu: a dated weekly promotion must not silently become permanent. After selecting recurrence, show just two schedule shapes:

- **“Same menu on selected days”**: one set of dishes, with Monday–Friday initially selected and all seven weekdays editable. Appropriate for a fixed lunch menu. The suggested weekdays are visible and must be confirmed with publication; they are not a claim about restaurant opening hours.
- **“Different menu for each weekday”**: dishes assigned to Monday, Tuesday and so on, repeating every week. Appropriate for rotating menus such as the observed Pizza Si menu. Empty weekdays publish nothing.

Use the same dish editor for both. Do not expose copying, cron jobs, generation horizons or template/version terminology in the owner interface.

## First publication

Keep the existing import from photo, text or link and restaurant assignment. Add recurrence in the publication preview, where the owner can see its consequences before saving. A manually entered menu follows the same path.

If extraction finds weekday-specific dishes, suggest the weekday schedule and preserve those assignments. If it finds a list without weekdays, suggest the fixed menu schedule. Suggestions do not override the owner's publication choice. Explicit dates must remain visible and must not silently turn into an indefinite schedule.

For a fixed menu, show weekday toggles and one dish list. For a rotating menu, show weekday sections with their dishes; include “Copy to another day” for convenience. Both show the start date, defaulting to today, and the plain-language summary “Repeats every week until you stop it”. An optional end date can be deferred from the first release.

Provide a preview for the coming week so the owner can catch “Friday only” before publication. Primary action: **“Publish menu”**. Confirm success only after the schedule and its immediately browsable offers are ready; on failure retain the entered menu and allow retry.

## Ongoing management

Make **“My menus”** the primary owner view for this feature. Show one card per restaurant with the recurrence status, selected weekdays and a concise menu summary. Keep existing dated offers accessible as history or individual offers, rather than showing dozens of automatically generated copies as the main management experience.

The restaurant card offers **“Edit menu”**, **“Skip a day”** and **“Stop repeating”**. Editing defaults to changing today's and future recurring menu; an optional start-date control enables a change from next Monday. Previously served dates retain the old menu and prices. A removed dish must disappear from future generated offers too.

For a one-day change, let the owner choose a date and either **“No lunch on this day”** or **“Use a different menu on this day”**. A replacement menu replaces the restaurant's entire recurring lunch menu for that date, avoiding ambiguous combinations of old and new dishes. Other dates keep the normal schedule. Removing the exception restores the recurring menu.

Stopping repetition takes effect immediately for today and future dates and removes the active menu's automatically generated offers from public browsing. Keep past history. Date-specific replacement menus are independent exceptions and remain published; the stop summary should make any such future exceptions visible. A “No lunch” exception hides all lunch offers for that restaurant/date. Ordinary unrelated one-off offers are not silently deleted when recurrence stops. If reactivation is added, owners must see the exceptions that will still apply.

Avoid repeated confirmation dialogs for routine edits. Make the effect and effective date visible before save. Stopping repetition should have a clear summary and a convenient undo or re-enable path.

## Visitor browsing

Show the same offer cards, filters, distances and detail pages for recurring and one-off offers. A small “Recurring menu” label may explain provenance, but no special browsing mode is needed. Missing menus must not look like database failures, and “No lunch on this date” should be explicit on the restaurant page when an owner has set that exception.

Extend the day selector to a rolling **14 days**, initially showing today and the nearest days, with an easily discoverable **“Next week”** shortcut and an absolute date heading. This makes next Monday reachable even when browsing on Monday. Support direct date links within the publication horizon; the visible selector does not need to expose the full horizon.

On a restaurant page, show that its recurring schedule is active and display the selected day's menu. Use **“Updated on …”** for the last real menu edit, not the daily background generation time. Automatic repetition is not evidence that a restaurant has freshly confirmed its menu. Do not introduce mandatory weekly confirmation, since that would bring back the user's original maintenance burden.

## Application to the observed restaurants

**Pizza Si:** turn the existing October 5–9 dishes into a reviewed weekday schedule. Monday's dish repeats on October 12, Tuesday's on October 13, and so on. Once activated, unchanged weeks require no owner action.

**Sushi Friends:** if the restaurant confirms that all four lunches apply on every working day, use a single fixed menu assigned to Monday–Friday. The October 9 publication date must not be treated as evidence of Friday-only availability. If the dishes really apply only on Fridays, retain Friday only. This cannot be safely inferred from the existing boolean.

## Recommended technical approach

Persist an explicit recurring schedule as the source of truth and generate dated `lunch_offers` from it. This preserves the existing offer IDs, detail routes, filters and distance queries. Query-time virtual offers are possible, but would require broader changes to identity, counts and detail/edit routes; they are not the recommended first implementation for this repository.

Create the next **30 calendar dates including today** when the owner publishes, edits or activates a menu. This stays within the existing insert date constraint. A daily background job maintains that horizon for every active schedule. Do not rely on a Monday-only job: next week's menu must be visible before Monday. Initial synchronous generation ensures that an owner sees the result immediately; background execution keeps the rolling horizon filled.

Use stable schedule-entry/date identity and database uniqueness to make retries idempotent. Keep generation provenance separate from the existing extraction `source_type`; preserve the source type rather than adding an incompatible value. Each generated occurrence records its schedule origin and effective menu revision, allowing edits, stops and exceptions to affect only the intended dates and records. Retain dish fields and historical restaurant snapshots under existing repository conventions.

Apply edits transactionally or use an activation boundary so visitors cannot see a half-updated menu. A one-day replacement takes precedence over the recurring menu; “No lunch” takes precedence over all offers for that restaurant/date. Counts, list results and detail-page visibility must use the same effective availability rules. Define how an existing generated detail URL behaves after its offer is withdrawn; it must not advertise a stopped menu as still available.

The scheduled process needs a narrowly scoped internal entry point. Owner-facing mutations continue to require authentication, ownership checks and RLS. A user must not gain permission to renew another user's source offers simply because background generation exists.

Monitor failed generation and retry it without duplicates. Surface an owner-facing publication problem when applicable. A scheduler outage must not silently convert the feature into weekly manual renewal; the pre-generated horizon provides recovery time.

## Transition from the current flag

Update Requirement 8.7, the design, glossary and interface copy to the new automatic semantics. Do not reinterpret all existing flagged restaurants without constructing a valid schedule.

Show owners of flagged restaurants a one-time **“Enable automatic repetition”** setup, with a populated preview from the latest coherent menu and a schedule choice. Preserve existing dated offers during setup. Reconcile future generated dates with existing offers explicitly so activation does not show duplicates; keep independent one-off offers independent. The action becomes automatic only after the owner confirms the schedule. For the observed Sushi Friends case, require the weekday choice instead of inferring it from a Friday timestamp.

Once a recurring schedule is active, remove the manual “Renew for next week” action for that menu. Keep manual duplication available for genuinely one-off menus if useful. The old flag should not remain a second independent setting that can disagree with the schedule's active state.

## First release and acceptance criteria

Ship both schedule shapes, explicit activation, the rolling browsing window, editing, stopping and single-day exceptions together. Without exceptions, owners would have to disable and rebuild a whole schedule to handle one closure; that is not a convenient recurring-menu feature. Defer multiple seasonal schedules, email reminders, advanced rule builders and mandatory freshness confirmations.

Acceptance examples:

1. Publish Pizza Si's recurring weekday menu on October 9: browsing October 12 immediately shows its Monday dish with correct price, filters and detail link, without renewal.
2. Publish the confirmed fixed Sushi Friends menu for Monday–Friday: all four lunches appear on October 12; no Saturday offers appear unless Saturday was selected.
3. Browse on a Monday: next Monday remains selectable.
4. Change a price starting October 12: October 9 history retains the old price, while October 12 onward uses the new one.
5. Remove a dish: future generated instances disappear without removing past history or unrelated one-off offers.
6. Skip October 12: no restaurant lunch appears on that date; October 13 remains unchanged. Removing the skip restores the schedule.
7. Replace October 12's menu: only the replacement is shown for that restaurant/day, and its count matches the list.
8. Stop recurrence: the recurring menu disappears for current/future dates, including through previously copied detail links; history and explicitly independent dated menus remain truthful.
9. Repeat generation or retry publication: no duplicate menu instances or partial public results appear.
10. Leave a menu unchanged for several weeks: the scheduled horizon continues to advance with no owner action.

This recommendation changes product behavior. It does not activate schedules, publish menus or modify the connected database.
