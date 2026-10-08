# Requirements Document

## Introduction

Restaurants are independent entities with address, location, price level, lunch hours and cuisine metadata. New offers require Restaurant assignment and store its publication Snapshot. Historical unlinked offers remain compatible. Authenticated Users manage their own Restaurants; Admins have additional capabilities. Application authorization and RLS independently protect ownership.

## Glossary

- **System**: Aplikacja webowa agregująca oferty lunchowe (Lunch Agregator)
- **User**: An authenticated account managing its own Restaurants; Visitors may browse. Full definitions live in `GLOSSARY.md`.
- **Restaurant**: Samodzielna encja reprezentująca restaurację z metadanymi (nazwa, adres, lokalizacja, poziom cenowy, godziny lunchowe, typ kuchni)
- **Lunch_Offer**: Pojedyncza oferta lunchowa powiązana z Restaurant
- **Location_Service**: Moduł odpowiedzialny za geokodowanie adresów i obliczanie odległości
- **Price_Level**: Kategoria cenowa restauracji (budżetowa, średnia, premium) określająca ogólny poziom cen
- **Lunch_Hours**: Przedział czasowy w którym restauracja serwuje lunch (np. 12:00-16:00)
- **Session_Token**: Legacy anonymous-data identifier retained for migration; current ownership uses `user_id`.

## Requirements

### Requirement 1: Tworzenie restauracji

**User Story:** As a User, I want to create a restaurant with its metadata, so that I can later associate lunch offers with it without repeating restaurant data.

#### Acceptance Criteria

1. WHEN a User submits a restaurant creation form with valid data, THE System SHALL create a new Restaurant entity and store it in the database within 3 seconds
2. THE System SHALL require each Restaurant to include: name (from 2 to 100 characters) and at least one of the following: address or geographic coordinates
3. THE System SHALL allow optional fields for each Restaurant: description (maximum 500 characters), Price_Level (one selection from: budżetowa, średnia, premium), Lunch_Hours (start time and end time in HH:MM format, where start time is earlier than end time), cuisine type (one or more selections from the predefined list), phone number (maximum 20 characters), and website URL (maximum 500 characters)
4. WHEN a User provides a restaurant address, THE Location_Service SHALL geocode the address to obtain geographic coordinates within 10 seconds
5. IF the Location_Service cannot geocode a provided address, THEN THE System SHALL store the Restaurant without coordinates and display a message indicating that distance-based features will not be available for this restaurant
6. THE System SHALL associate each created Restaurant with the authenticated User's user_id to establish ownership
7. IF a User submits a Restaurant with missing or invalid required fields, THEN THE System SHALL reject the submission, highlight the invalid fields, and display a specific message indicating what correction is needed

### Requirement 2: Edycja restauracji

**User Story:** As a User, I want to edit restaurants I have created, so that I can keep restaurant information up to date.

#### Acceptance Criteria

1. WHEN a User selects a Restaurant they own (identified by matching authenticated user_id), THE System SHALL display an edit form pre-filled with the current Restaurant data
2. WHEN a User submits valid changes to a Restaurant, THE System SHALL update the Restaurant entity in the database and reflect the changes within 3 seconds
3. IF a User attempts to edit a Restaurant owned by another user, unless acting with administrator permissions, THEN THE System SHALL deny the operation and display a message indicating the User does not have permission to edit this restaurant
4. WHEN a User changes the address of a Restaurant, THE Location_Service SHALL re-geocode the new address to update geographic coordinates
5. THE System SHALL validate all edited fields using the same constraints as during creation (name 2-100 characters, description maximum 500 characters, Lunch_Hours start before end)

### Requirement 3: Usuwanie restauracji

**User Story:** As a User, I want to delete restaurants I have created, so that I can remove outdated or incorrect entries.

#### Acceptance Criteria

1. WHEN a User requests deletion of a Restaurant they own (identified by matching authenticated user_id), THE System SHALL display a confirmation prompt before proceeding
2. WHEN a User confirms deletion of a Restaurant, THE System SHALL remove the Restaurant entity from the database within 3 seconds
3. IF a Restaurant has associated Lunch_Offers, THEN THE System SHALL inform the User about the number of associated offers and require explicit confirmation before deletion
4. WHEN a Restaurant with associated Lunch_Offers is deleted, THE System SHALL detach all linked offers (restaurant_id becomes NULL) while preserving their existing publication snapshots (name, address, location), regardless of subsequent changes to the Restaurant or the offer owner. Failed database deletion SHALL leave the Restaurant and its linked offers unchanged. Decision: #105, confirmed 2026-10-07.
5. IF a User attempts to delete a Restaurant owned by another user, unless acting with administrator permissions, THEN THE System SHALL deny the operation and display a message indicating the User does not have permission to delete this restaurant

### Requirement 4: Przeglądanie restauracji

**User Story:** As a User, I want to browse available restaurants, so that I can see which restaurants are registered and view their details.

#### Acceptance Criteria

1. WHEN a User opens the restaurants listing page, THE System SHALL display a list of all Restaurants sorted alphabetically by name, limited to a maximum of 50 restaurants per page
2. THE System SHALL display for each Restaurant on the list: name, Price_Level (if set), cuisine type (if set), Lunch_Hours (if set), and distance from User (if User location is available)
3. WHEN a User selects a Restaurant from the list, THE System SHALL display full details including: name, description, address, Price_Level, Lunch_Hours, cuisine type, phone number, website URL, and the number of associated active Lunch_Offers
4. WHEN a User's location is available, THE System SHALL display the distance to each Restaurant in kilometers rounded to one decimal place
5. IF no Restaurants are registered in the system, THEN THE System SHALL display a message informing the User that no restaurants are available and suggest adding one

### Requirement 5: Filtrowanie restauracji

**User Story:** As a User, I want to filter restaurants by various criteria, so that I can quickly find restaurants matching my preferences.

#### Acceptance Criteria

1. WHEN a User applies a distance filter, THE System SHALL display only Restaurants within the specified radius (selectable from 0.5 km to 25 km) calculated from the User's current location
2. WHEN a User applies a Price_Level filter, THE System SHALL display only Restaurants matching at least one of the selected price levels
3. WHEN a User applies a cuisine type filter, THE System SHALL display only Restaurants matching at least one of the selected cuisine types
4. WHEN a User applies a Lunch_Hours filter (specifying a time), THE System SHALL display only Restaurants whose Lunch_Hours interval contains the specified time
5. WHEN a User enters a search query of at least 2 characters, THE System SHALL display Restaurants where the name or description contains the query text (case-insensitive, partial match)
6. WHEN a User applies multiple filters simultaneously, THE System SHALL display only Restaurants satisfying all active filter conditions (AND logic)
7. IF no Restaurants match the applied filters, THEN THE System SHALL display an empty-state message indicating that no restaurants match the current criteria and suggest adjusting the filters

### Requirement 6: Powiązanie ofert z restauracjami

**User Story:** As a User, I want to associate lunch offers with existing restaurants, so that I do not need to re-enter restaurant data for each offer.

#### Acceptance Criteria

1. WHEN a User creates a new Lunch_Offer, THE System SHALL provide an option to select an existing Restaurant from a searchable dropdown list
2. WHEN a User selects an existing Restaurant for a Lunch_Offer, THE System SHALL automatically populate the offer's restaurant name, address, and location fields from the selected Restaurant entity
3. WHEN a User creates a new Lunch_Offer, THE System SHALL require assignment to an existing or newly created Restaurant before opening the offer form. Existing unlinked offers remain readable and retain their snapshots.
4. WHEN a Restaurant's data is updated, THE System SHALL NOT retroactively change the restaurant data embedded in previously created Lunch_Offers (offers retain a snapshot of restaurant data at creation time)
5. THE System SHALL display on the Restaurant detail page a list of all active Lunch_Offers associated with that Restaurant

### Requirement 8: Review and publication in restaurant context

1. WHEN creation starts from a Restaurant detail page, THE System SHALL preserve the requested Restaurant through any required login redirect, resolve it on the server and preserve its assignment through manual entry, extraction, preview and publication. The User may explicitly change that assignment before publication.
2. IF the requested Restaurant identifier is invalid or no longer exists, THE System SHALL explain the problem and allow the normal assignment flow.
3. THE User SHALL be able to correct each weekly-menu offer's name, price, set components and availability date, and exclude individual offers before publication without excluding the whole day.
4. THE System SHALL validate every selected offer against the publication schema, visibly report invalid entries and block publication until they are corrected or excluded. It SHALL NOT silently discard selected incomplete dishes. Unedited metadata and draft corrections SHALL survive rejected submission.
5. THE System SHALL count selected offers rather than selected days and accept at most 50 offers per publication batch. Oversized requests SHALL be rejected on the server before any offer is written; the preview SHALL explain the limit.
6. Before deleting a Restaurant, THE System SHALL show the total number of linked offers, including expired offers, and explain that they will be detached rather than deleted. Failure to obtain the count SHALL be visible and SHALL block confirmation rather than appear as zero.

These requirements cover #101–#104. Import source fetching, explicit source-week interpretation, idempotency and safe retries belong to #94. GPS reverse geocoding is deferred; a date filter on the Restaurant catalog is outside this scope.

### Requirement 7: Walidacja godzin lunchowych

**User Story:** As a User, I want to set lunch hours for a restaurant, so that other users know when lunch is served.

#### Acceptance Criteria

1. THE System SHALL accept Lunch_Hours as a pair of time values: start time and end time, each in HH:MM format (24-hour clock)
2. THE System SHALL validate that the start time is strictly earlier than the end time (same-day lunch service only)
3. THE System SHALL accept start time values from 06:00 to 18:00 and end time values from 07:00 to 23:00
4. IF a User provides Lunch_Hours where start time is equal to or later than end time, THEN THE System SHALL reject the input and display a message indicating that start time must be earlier than end time
5. WHEN displaying Lunch_Hours, THE System SHALL format the time range as "HH:MM - HH:MM" (e.g., "12:00 - 16:00")
