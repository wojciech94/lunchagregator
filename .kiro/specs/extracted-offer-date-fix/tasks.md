# Implementation Plan: Extracted Offer Date Fix

## Overview

Fix only the single-offer form’s initial availability-date selection. Use a recognized first dish weekday to determine its inclusive next local date, retain the local-date fallback for unusable weekday data, and preserve all behavior outside that condition.

## Tasks

- [x] 1. Write bug condition exploration tests before implementing the fix
  - **Property 1: Bug Condition** - Recognized Weekday Resolves to Its Inclusive Next Local Date
  - **CRITICAL**: Write and run this property-based test on the unfixed single-offer form; it must fail for target weekdays that differ from the local current weekday. Do not alter production code when it fails.
  - Scope generated cases to every pair of relevant local weekday and valid canonical `DayOfWeek` (`monday` through `sunday`) for the first selected extracted dish, including a Lunch Set whose soup and daily dish are in `items`.
  - Render `OfferForm` with controlled `PrefilledOffer` data and a frozen local date; assert the initial `availableDate` equals `nextDateForDay(firstDish.dayOfWeek, localNow)`, is local `YYYY-MM-DD`, and falls from zero to six days ahead.
  - Document the expected counterexamples on unfixed code: Thursday 2026-07-30 plus `friday` produces `2026-07-30` instead of `2026-07-31`; Friday plus `monday` produces Friday instead of the following Monday. Include the same-day Thursday control and verify `nextDateForDay`/the weekly flow already resolves Friday correctly.
  - Verify the assertion also preserves all non-date extracted fields and the editable date input for recognized-weekday cases.
  - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 3.6_

- [x] 2. Write preservation property tests before implementing the fix
  - **Property 2: Preservation** - Non-Resolvable Weekday and Existing Form Behavior Remain Unchanged
  - **IMPORTANT**: Follow observation-first methodology on unfixed code. Capture the normal local-date default and observable form behavior before changing the implementation.
  - Generate extracted offers with `null`, absent, malformed, unsupported, and unassociated weekday values at the resolution boundary, together with valid arbitrary metadata; verify their initial values retain the observed normal current-local-date default, valid extracted data, and editable controls.
  - Generate non-bug-condition edit and error action sequences. Verify manual edits to the date and another field survive rejected submission, and missing, invalid, past, and more-than-30-days-future dates retain existing field-level feedback, error recovery, and manual-entry values.
  - Confirm the preservation tests pass on unfixed code; also retain a weekly-menu control showing existing batch weekday-date resolution is unchanged.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix extracted single-offer availability-date initialization
  - [x] 3.1 Implement the minimal `OfferForm` initialization fix
    - In `src/components/add-offer/OfferForm.tsx`, update `buildDefaultValues` to use `nextDateForDay(firstDish.dayOfWeek)` when the first selected dish has a valid canonical `DayOfWeek`.
    - For no usable weekday, retain the normal local-date fallback using `todayISO()`. Remove the component-local UTC `getTodayISO` helper and use `todayISO()` for both the fallback default and the date input `min` value.
    - Leave source type, restaurant details, dish metadata, `items`, dietary tags, allergens, missing-field handling, submit handlers, form state, extraction contracts, payloads, persistence, server validation, and `WeeklyMenuPreview` unchanged.
    - _Bug_Condition: `isBugCondition({ selectedDish, localNow })` holds when a selected first dish has valid `dayOfWeek` and the normal default differs from `nextDateForDay(dayOfWeek, localNow)`._
    - _Expected_Behavior: `availableDate = nextDateForDay(selectedDish.dayOfWeek, localNow)`; it is permitted, non-date fields are unchanged, and the date remains editable._
    - _Preservation: Unusable weekdays use `todayISO()`; existing edits, validation, failures, metadata prefilling, and weekly-menu behavior are unchanged._
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.2 Verify the exploration test now passes
    - **Property 1: Expected Behavior** - Recognized Weekday Resolves to Its Inclusive Next Local Date
    - **IMPORTANT**: Re-run the same Property 1 test from task 1; do not write a replacement test.
    - Confirm all local-weekday/canonical-weekday pairs now resolve inclusively, including Thursday 2026-07-30 → Friday 2026-07-31, Friday → next Monday, same-day matching, and Lunch Set item preservation.
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 3.6_

  - [x] 3.3 Verify the preservation tests still pass
    - **Property 2: Preservation** - Non-Resolvable Weekday and Existing Form Behavior Remain Unchanged
    - **IMPORTANT**: Re-run the same Property 2 tests from task 2; do not write replacement tests.
    - Confirm fallback local defaults, manual edits, validation feedback, error recovery, independently extracted metadata, and the weekly flow remain unchanged.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the targeted OfferForm/date-utility and integration tests, then the relevant project test suite; ensure exploratory and preservation properties pass after the fix.
  - Confirm no unrelated extraction, persistence, server validation, or weekly-menu behavior changed. Ask the user if questions arise.

## Notes

- Tasks 1 and 2 are standalone, pre-implementation property tests: Task 1 must demonstrate the defect on unfixed code; Task 2 must pass before the fix.
- The implementation remains limited to `OfferForm` initialization and existing local date utilities; no extraction, persistence, validation, or weekly-menu changes are planned.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3"] },
    { "id": 4, "tasks": ["4"] }
  ]
}
```
