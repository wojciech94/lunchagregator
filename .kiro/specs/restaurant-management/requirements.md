# Requirements Document

## Introduction

Funkcjonalność zarządzania restauracjami jako samodzielnymi encjami w aplikacji Lunch Aggregator. Obecnie dane restauracji (nazwa, adres, lokalizacja) są zduplikowane w każdej ofercie lunchowej. Nowa funkcjonalność wprowadza osobną tabelę restauracji z pełnym zestawem metadanych (lokalizacja, poziom cenowy, godziny lunchowe, typ kuchni) oraz umożliwia powiązanie ofert lunchowych z restauracjami zamiast osadzania danych restauracji w każdej ofercie. Użytkownicy mogą tworzyć, edytować i usuwać restauracje w ramach swojej sesji anonimowej.

## Glossary

- **System**: Aplikacja webowa agregująca oferty lunchowe (Lunch Aggregator)
- **User**: Osoba korzystająca z aplikacji — może przeglądać restauracje, dodawać nowe oraz zarządzać nimi
- **Restaurant**: Samodzielna encja reprezentująca restaurację z metadanymi (nazwa, adres, lokalizacja, poziom cenowy, godziny lunchowe, typ kuchni)
- **Lunch_Offer**: Pojedyncza oferta lunchowa powiązana z Restaurant
- **Location_Service**: Moduł odpowiedzialny za geokodowanie adresów i obliczanie odległości
- **Price_Level**: Kategoria cenowa restauracji (budżetowa, średnia, premium) określająca ogólny poziom cen
- **Lunch_Hours**: Przedział czasowy w którym restauracja serwuje lunch (np. 12:00-16:00)
- **Session_Token**: Anonimowy identyfikator sesji użytkownika przechowywany w cookie/localStorage, służący do identyfikacji właściciela restauracji

## Requirements

### Requirement 1: Tworzenie restauracji

**User Story:** As a User, I want to create a restaurant with its metadata, so that I can later associate lunch offers with it without repeating restaurant data.

#### Acceptance Criteria

1. WHEN a User submits a restaurant creation form with valid data, THE System SHALL create a new Restaurant entity and store it in the database within 3 seconds
2. THE System SHALL require each Restaurant to include: name (from 2 to 100 characters) and at least one of the following: address or geographic coordinates
3. THE System SHALL allow optional fields for each Restaurant: description (maximum 500 characters), Price_Level (one selection from: budżetowa, średnia, premium), Lunch_Hours (start time and end time in HH:MM format, where start time is earlier than end time), cuisine type (one or more selections from the predefined list), phone number (maximum 20 characters), and website URL (maximum 500 characters)
4. WHEN a User provides a restaurant address, THE Location_Service SHALL geocode the address to obtain geographic coordinates within 10 seconds
5. IF the Location_Service cannot geocode a provided address, THEN THE System SHALL store the Restaurant without coordinates and display a message indicating that distance-based features will not be available for this restaurant
6. THE System SHALL associate each created Restaurant with the User's Session_Token to establish ownership
7. IF a User submits a Restaurant with missing or invalid required fields, THEN THE System SHALL reject the submission, highlight the invalid fields, and display a specific message indicating what correction is needed

### Requirement 2: Edycja restauracji

**User Story:** As a User, I want to edit restaurants I have created, so that I can keep restaurant information up to date.

#### Acceptance Criteria

1. WHEN a User selects a Restaurant they own (identified by matching Session_Token), THE System SHALL display an edit form pre-filled with the current Restaurant data
2. WHEN a User submits valid changes to a Restaurant, THE System SHALL update the Restaurant entity in the database and reflect the changes within 3 seconds
3. IF a User attempts to edit a Restaurant with a non-matching Session_Token, THEN THE System SHALL deny the operation and display a message indicating the User does not have permission to edit this restaurant
4. WHEN a User changes the address of a Restaurant, THE Location_Service SHALL re-geocode the new address to update geographic coordinates
5. THE System SHALL validate all edited fields using the same constraints as during creation (name 2-100 characters, description maximum 500 characters, Lunch_Hours start before end)

### Requirement 3: Usuwanie restauracji

**User Story:** As a User, I want to delete restaurants I have created, so that I can remove outdated or incorrect entries.

#### Acceptance Criteria

1. WHEN a User requests deletion of a Restaurant they own (identified by matching Session_Token), THE System SHALL display a confirmation prompt before proceeding
2. WHEN a User confirms deletion of a Restaurant, THE System SHALL remove the Restaurant entity from the database within 3 seconds
3. IF a Restaurant has associated Lunch_Offers, THEN THE System SHALL inform the User about the number of associated offers and require explicit confirmation before deletion
4. WHEN a Restaurant with associated Lunch_Offers is deleted, THE System SHALL retain the Lunch_Offers with embedded restaurant data (name, address, location copied from the Restaurant at the time of deletion) to preserve offer integrity
5. IF a User attempts to delete a Restaurant with a non-matching Session_Token, THEN THE System SHALL deny the operation and display a message indicating the User does not have permission to delete this restaurant

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
3. WHEN a User creates a Lunch_Offer without selecting an existing Restaurant, THE System SHALL allow manual entry of restaurant data as in the current behavior (embedded restaurant name, address, location)
4. WHEN a Restaurant's data is updated, THE System SHALL NOT retroactively change the restaurant data embedded in previously created Lunch_Offers (offers retain a snapshot of restaurant data at creation time)
5. THE System SHALL display on the Restaurant detail page a list of all active Lunch_Offers associated with that Restaurant

### Requirement 7: Walidacja godzin lunchowych

**User Story:** As a User, I want to set lunch hours for a restaurant, so that other users know when lunch is served.

#### Acceptance Criteria

1. THE System SHALL accept Lunch_Hours as a pair of time values: start time and end time, each in HH:MM format (24-hour clock)
2. THE System SHALL validate that the start time is strictly earlier than the end time (same-day lunch service only)
3. THE System SHALL accept start time values from 06:00 to 18:00 and end time values from 07:00 to 23:00
4. IF a User provides Lunch_Hours where start time is equal to or later than end time, THEN THE System SHALL reject the input and display a message indicating that start time must be earlier than end time
5. WHEN displaying Lunch_Hours, THE System SHALL format the time range as "HH:MM - HH:MM" (e.g., "12:00 - 16:00")
