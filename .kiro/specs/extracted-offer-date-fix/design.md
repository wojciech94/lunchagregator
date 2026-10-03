# Extracted Offer Date Fix Bugfix Design

## Overview

Extracted dishes already carry a canonical `DayOfWeek`, but the single-offer editor always initializes `availableDate` with a UTC-derived current date. The fix will use the selected dish's recognized weekday to calculate its inclusive next local calendar occurrence, while continuing to use the current local day whenever no trustworthy weekday exists. It will reuse the existing local-date utility used by weekly-menu publishing; no extraction API, persistence schema, or publication rules change.

## Glossary

- **Bug_Condition (C)**: A single-offer form is opened for an extracted dish or lunch set with a valid canonical `dayOfWeek`, but its availability date is initialized to the normal default date rather than the inclusive next occurrence of that weekday.
- **Property (P)**: For C, the form is initialized with the corresponding valid local ISO date; its remaining extracted values and editability are preserved.
- **Preservation**: For ¬C, date defaulting, manual edits, validation, extraction failure handling, and independently extracted metadata retain their current behavior.
- **`DayOfWeek`**: The extraction contract's canonical weekday union: `monday` through `sunday`; Polish labels, including capitalization and diacritics, are mapped to it by the extraction schema/prompt.
- **`nextDateForDay`**: `src/utils/day-of-week.ts` helper that returns the local `YYYY-MM-DD` for a target weekday, counting today as a match.
- **`buildDefaultValues`**: `src/components/add-offer/OfferForm.tsx` helper that derives initial `react-hook-form` values from the first prefilled dish.
- **Relevant offer timezone**: The local calendar context already used by the browser/runtime date helpers. No restaurant- or offer-specific timezone is currently persisted, so the fix must use the existing local-date semantics consistently rather than introduce a new timezone source.

## Bug Details

### Bug Condition

The bug manifests in the single-offer editor when extraction successfully associates the first selected dish (including a Lunch Set represented by one dish with `items`) with a weekday but `buildDefaultValues` ignores `dayOfWeek` and assigns the default date. The current `getTodayISO` implementation also formats through `Date.toISOString()`, which can produce a UTC calendar date different from the relevant local calendar date.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { selectedDish, localNow }
  OUTPUT: boolean

  RETURN input.selectedDish.dayOfWeek IN {
           monday, tuesday, wednesday, thursday, friday, saturday, sunday
         }
     AND formUsesNormalDefaultDate(input.selectedDish, input.localNow)
     AND formUsesNormalDefaultDate(input.selectedDish, input.localNow)
         != nextDateForDay(input.selectedDish.dayOfWeek, input.localNow)
END FUNCTION
```

**Required Property Specification:**
```
FUNCTION expectedBehavior(input, result)
  INPUT: input of type { selectedDish, localNow }, result of type initial form values
  OUTPUT: boolean

  RETURN result.availableDate
           = nextDateForDay(input.selectedDish.dayOfWeek, input.localNow)
     AND isPermittedAvailableDate(result.availableDate, input.localNow)
     AND allNonDateFieldsEqual(result, input.selectedDish)
     AND availableDateRemainsUserEditable(result)
END FUNCTION
```

### Examples

- A photo headed `Piątek`, extracted as `friday`, opened on local Thursday 2026-07-30, must prefill `2026-07-31`; the actual defective value is `2026-07-30`.
- A text or link extraction marked `monday`, opened on local Friday, must prefill the Monday three days later, not the preceding Monday.
- An extraction marked `thursday`, opened on a local Thursday, must prefill that same Thursday (zero-day offset).
- A lunch set marked `friday` with soup and daily dish stored in its `items` must receive the Friday date without altering the name, price, or items.
- A dish with `dayOfWeek: null` must retain the normal current-local-date default.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Weekly-menu preview and batch publication continue to resolve each selected weekday with the existing `nextDateForDay` behavior.
- Missing, malformed, unsupported, or unassociated weekday data continues to select the normal current-local-date default while retaining valid extracted values and editable controls.
- Users may change the prefilled date and any other field; those values survive validation/submission errors until changed or a new add-offer flow starts.
- Existing permitted-date validation (today through 30 days ahead), field-level errors, extraction/submission errors, and manual-entry recovery remain unchanged.
- Restaurant details, names, prices, descriptions, set components, dietary tags, and allergens remain independently prefilled.

**Scope:**
The change is limited to initial date selection for a single-offer form whose selected first dish has a valid canonical weekday. It must not modify extraction requests, server actions, the offer payload, saved offers, or interactions after form initialization.

## Hypothesized Root Cause

1. **Ignored weekday metadata in the single-offer path**: `PrefilledDish` retains `dayOfWeek` after `validateExtraction`, but `OfferForm.buildDefaultValues` always assigns `availableDate: getTodayISO()` and never reads `firstDish.dayOfWeek`.
2. **Inconsistent local-date formatting**: `OfferForm.getTodayISO` uses `toISOString()`, while `src/utils/day-of-week.ts` intentionally formats local dates. Around a UTC date boundary, the form may display the wrong local default even without a weekday.
3. **Divergent but already-correct weekly path**: `WeeklyMenuPreview` uses `nextDateForDay` for batch entries. The single-offer path was not aligned with this established behavior.
4. **Ambiguous/unusable extraction data must not be promoted**: The typed normal path supplies a `DayOfWeek | null`; malformed or unassociated external data must be treated as absent at the resolution boundary rather than causing an invalid date or a blocked form.

## Correctness Properties

Property 1: Bug Condition - Recognized Weekday Resolves to Its Inclusive Next Local Date

_For any_ selected extracted dish or lunch set whose `dayOfWeek` is a valid canonical `DayOfWeek`, and for any relevant local calendar date, the fixed form initialization SHALL set `availableDate` to `nextDateForDay(dayOfWeek, localNow)`, returning today for the same weekday and the following calendar week for an earlier weekday.

**Validates: Requirements 1.1, 2.1, 2.2, 2.3**

Property 2: Bug Condition - Date Resolution Preserves Extracted Data and Editability

_For any_ valid extracted offer with a recognized weekday and arbitrary valid extracted non-date fields, the fixed form initialization SHALL produce a permitted calendar-date value while preserving restaurant details, dish name, price, description, set components, dietary tags, allergens, and the user's ability to edit every form field.

**Validates: Requirements 2.4, 3.6**

Property 3: Preservation - Non-Resolvable Weekday Inputs Retain the Normal Default

_For any_ extracted offer whose selected dish has no associated valid canonical weekday, including null, absent, malformed, unsupported, or unassociated values at the resolution boundary, the fixed form initialization SHALL produce the same normal current-local-date default as the original function and retain all valid extracted data and manual editing capability.

**Validates: Requirements 3.1, 3.2**

Property 4: Preservation - Existing Form State and Validation Are Unchanged After Initialization

_For any_ initialized add-offer flow that is outside the weekday-date bug condition, the fixed code SHALL preserve the original behavior for user edits, invalid or out-of-range date rejection, extraction/submission error recovery, field-level feedback, and manual-entry value retention.

**Validates: Requirements 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming the root-cause analysis is confirmed by exploratory tests:

**File**: `src/components/add-offer/OfferForm.tsx`

**Function**: `buildDefaultValues` (and the local default-date helper it currently uses)

**Specific Changes:**
1. **Use the canonical weekday when it exists**: Read `firstDish?.dayOfWeek`. If it is a valid `DayOfWeek`, initialize `availableDate` with `nextDateForDay(firstDish.dayOfWeek)`.
2. **Preserve fallback behavior**: If the first dish has no usable weekday, initialize `availableDate` with the existing app-standard local default, `todayISO()`.
3. **Eliminate the UTC-only helper**: Remove the component-local `getTodayISO` and use `todayISO` from `src/utils/day-of-week.ts` both for the fallback/default and the date input's `min` value. This retains a single local-calendar convention.
4. **Leave all other default values untouched**: Do not alter mapping for source type, restaurant identity/address, dish metadata, items, dietary tags, allergens, missing-field indicators, submit handlers, or form state management.
5. **Do not modify the weekly flow**: `WeeklyMenuPreview` already uses `nextDateForDay`; no behavioral or structural change is required there.

The implementation uses only the existing `DayOfWeek` extraction contract and date utility. It does not add dependencies, change AI prompts/schemas, persist a timezone, or change server-side validation. The existing date limit remains safe because an inclusive next occurrence is at most six local days away.

## Testing Strategy

### Validation Approach

Use two phases: first run bug-condition tests against the current behavior to produce the expected counterexamples, then apply the minimal form-initialization fix and rerun them alongside preservation tests. Freeze the local clock (or pass an explicit date to `nextDateForDay`) so calendar behavior is deterministic and no test depends on the machine timezone.

### Exploratory Bug Condition Checking

**Goal**: Demonstrate that the unfixed single-offer form discards recognized weekday metadata and confirm that the weekly utility itself is not the defect.

**Test Plan**: Render `OfferForm` with controlled `PrefilledOffer` data and inspect the date input's initial value. Separately exercise `nextDateForDay` with an explicit local date. Run the form assertions before the fix to observe the counterexamples.

**Test Cases:**
1. **Friday Lunch Set**: With local Thursday 2026-07-30 and first dish `dayOfWeek: 'friday'`, expect `2026-07-31`; the unfixed form displays `2026-07-30`.
2. **Earlier Weekday Roll-over**: With local Friday and `dayOfWeek: 'monday'`, expect the following Monday; the unfixed form displays Friday.
3. **Same-Day Weekday**: With local Thursday and `dayOfWeek: 'thursday'`, expect Thursday; this confirms inclusive semantics and will happen to pass on unfixed code, so it is not evidence of a complete fix.
4. **Weekly Control**: Confirm `WeeklyMenuPreview`/`nextDateForDay('friday', Thursday)` already gives Friday, isolating the failure to single-offer initialization.

**Expected Counterexamples:**
- Every valid extracted weekday that differs from today yields the normal default date instead of its next occurrence.
- The single-offer form and weekly flow resolve dates differently despite sharing the same extraction field.

### Fix Checking

**Goal**: Verify Property 1 and Property 2 for all recognized weekdays and all local weekdays.

**Pseudocode:**
```
FOR ALL localNow, targetDay WHERE isBugCondition({ selectedDish: { dayOfWeek: targetDay }, localNow }) DO
  result := buildDefaultValues_fixed({ selectedDish: { dayOfWeek: targetDay }, localNow })
  ASSERT expectedBehavior({ selectedDish: { dayOfWeek: targetDay }, localNow }, result)
END FOR
```

### Preservation Checking

**Goal**: Verify Property 3 and Property 4: all flows outside the bug condition retain original behavior.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT initializeForm_original(input) = initializeForm_fixed(input)
END FOR
```

For interactions that intentionally update state, compare the original and fixed observable behavior after the same action sequence rather than requiring object identity.

### Unit Tests

- Add deterministic tests for `nextDateForDay` covering all seven target weekdays, same-day inclusion, and next-week wraparound with explicit local dates.
- Add `OfferForm` tests showing recognized `dayOfWeek` prepopulates the date, including Thursday 2026-07-30 → Friday 2026-07-31 for a Lunch Set with soup/daily-dish items.
- Add fallback tests for null/absent/unusable weekday values and confirm the local default is used.
- Assert manual changes to the prefilled date and another field persist through a rejected submission; assert invalid, missing, past, and more-than-30-days-future dates retain existing validation errors.

### Property-Based Tests

- Generate every pair of a local weekday and canonical target weekday; assert the resolved date has the target weekday and a difference from zero through six days, with zero only for a matching weekday (Property 1).
- Generate valid extracted metadata alongside recognized weekdays; assert date resolution changes only `availableDate`, the result is permitted, and all non-date mappings are preserved (Property 2).
- Generate null and invalid-at-boundary weekday representations plus arbitrary valid metadata; assert the initial values match the original fallback behavior (Property 3).
- Generate edit/error action sequences outside C; assert the fixed flow preserves original field values, validation feedback, and manual-entry recovery (Property 4).

### Integration Tests

- Exercise photo, pasted-text, and link submissions that produce a single Friday offer; after opening the editor, verify Friday is prefilled and publication submits that date.
- Exercise a weekly menu with multiple weekdays to confirm its existing batch dates are unchanged and a separately opened single offer follows the same date convention.
- Exercise extraction failure and submission validation failure after editing a date; verify the existing Polish error feedback, manual-entry option, and entered form values remain visible.
