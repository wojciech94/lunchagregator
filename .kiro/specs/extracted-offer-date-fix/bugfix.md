# Bugfix Requirements Document

## Introduction

Fix the extracted-offer availability-date defect: weekday information recognized from a menu must prefill the offer editor with that weekday’s correct upcoming calendar date, rather than always selecting the current day. This applies to Polish menu photos, text, and links while retaining the existing editing, fallback, and validation experience.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a menu photo contains a Lunch Set headed `Piątek` and extraction associates the soup and daily dish with Friday, while the relevant local date is Thursday, 30 July 2026, THEN the offer editor preselects Thursday, 30 July 2026 instead of Friday, 31 July 2026.

### Expected Behavior (Correct)

2.1 WHEN extraction identifies a Polish weekday label (`poniedziałek`, `wtorek`, `środa`, `czwartek`, `piątek`, `sobota`, or `niedziela`) for an extracted dish or lunch set, including normal capitalization and Polish diacritics, THEN the system SHALL deterministically resolve the availability date to the next occurrence of that weekday, including the current date when it has that weekday, in the relevant offer timezone.

2.2 WHEN the extracted menu heading is `Piątek` and the relevant local date is Thursday, 30 July 2026, THEN the system SHALL preselect Friday, 31 July 2026 as the availability date for the extracted Lunch Set, including its soup and daily dish.

2.3 WHEN the extracted weekday occurs earlier than the relevant local weekday, THEN the system SHALL preselect that weekday in the following calendar week.

2.4 WHEN a recognized weekday is supplied with an extracted offer, THEN the system SHALL resolve and prefill a valid calendar-date value without changing the extracted offer’s other fields or preventing the user from editing the form.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN no weekday can be extracted from the submitted menu content, THEN the system SHALL CONTINUE TO preselect the normal default availability date for the relevant local calendar day.

3.2 WHEN an extracted weekday is absent, malformed, unsupported, or cannot be associated with a specific offer or dish, THEN the system SHALL CONTINUE TO use the normal default availability date, retain the extracted data that is valid, and allow the user to correct the form manually.

3.3 WHEN a user manually changes the prefilled availability date or any other offer field, THEN the system SHALL CONTINUE TO preserve those manual edits until the user changes them or starts a new add-offer flow.

3.4 WHEN an availability date is missing, invalid, or outside the existing permitted range, THEN the system SHALL CONTINUE TO block publication and present the existing field-level validation feedback rather than saving an invalid offer.

3.5 WHEN extraction or submission fails, THEN the system SHALL CONTINUE TO show the existing error feedback and offer a manual-entry path without discarding user-entered form values.

3.6 WHEN extraction successfully provides restaurant details, dish names, prices, descriptions, set components, dietary tags, or allergens, THEN the system SHALL CONTINUE TO prefill and preserve those values independently of weekday-date resolution.
