# Requirements Document

## Introduction

Aplikacja webowa agregująca oferty lunchowe z pobliskich restauracji. Przeglądanie aktualnych menu lunchowych, filtrowanie ofert według lokalizacji, kuchni i ceny, geolokalizacja oraz czat AI z rekomendacjami posiłków są dostępne bez logowania. Dodawanie i zarządzanie ofertami wymaga zalogowanego konta — użytkownik wkleja link, tekst lub zdjęcie, AI analizuje je i tworzy z nich ustrukturyzowaną ofertę. Zbudowana w oparciu o Next.js, TypeScript, Supabase (baza danych) oraz Vercel AI SDK (analiza treści i rekomendacje).

Anonimowe dodawanie ofert zostało **świadomie wycofane**. Pierwotna wersja tego dokumentu zakładała, że każdy może dodawać oferty bez konta; wymagało to identyfikacji wyłącznie tokenem sesji, co nie jest mechanizmem własności. Kryteria 5.1–5.8 oraz 6.1–6.6 są teraz zapisane jako „WHEN a User…", czyli wymagają konta. Sposób działania autentykacji jest opisany w `.kiro/specs/user-authentication/` i **nie** jest zakresem tego dokumentu.

## Glossary

- **System**: Aplikacja webowa agregująca oferty lunchowe
- **User**: Zalogowane konto — może przeglądać oferty, filtrować, dodawać nowe, zarządzać własnymi oraz korzystać z rekomendacji AI
- **Visitor**: Osoba bez konta — może przeglądać oferty, filtrować, korzystać z geolokalizacji i rekomendacji AI, ale **nie może** dodawać ani zarządzać ofertami
- **Lunch_Offer**: Pojedyncza oferta lunchowa zawierająca nazwę dania, cenę, opis, restaurację i dostępność
- **AI_Recommender**: Moduł oparty na Vercel AI SDK generujący rekomendacje posiłków w ramach sesji czatu
- **AI_Analyzer**: Moduł oparty na Vercel AI SDK analizujący wklejone treści (linki, tekst, zdjęcia) i tworzący z nich ustrukturyzowane oferty
- **Location_Service**: Moduł odpowiedzialny za geolokalizację i obliczanie odległości

> **Uwaga o zakresie.** `User` i `Visitor` dzielą tu tylko uprawnienia, nie mechanizm logowania. Sposób uwierzytelniania, sesji i migracji danych ze starych tokenów jest specyfikowany w `.kiro/specs/user-authentication/`. Ten dokument wymaga konta tam, gdzie kryterium mówi „User", i nie powtarza zasad autentykacji.

**Wykorzystanie danych na darmowym tierze.** Dostawca AI działa na darmowym tierze, więc treści przesyłane przez użytkowników — w tym zdjęcia menu z kryterium 5.3 — są wykorzystywane do ulepszania produktów Google. Jest to przyjęty koszt ograniczenia do darmowego tiera, a nie skutek uboczny, o którym użytkownik nie wie.

## Requirements

### Requirement 1: Przeglądanie ofert lunchowych

**User Story:** As a User, I want to browse current lunch offers from nearby restaurants, so that I can decide where to eat.

#### Acceptance Criteria

1. WHEN a User opens the main page, THE System SHALL display a list of available Lunch_Offers for the current day, limited to a maximum of 50 offers per page, and — once the User's location is available — sorted by distance from the User in ascending order (nearest first)

> **Uwaga do 1.1.** Sortowanie według odległości obowiązuje *od chwili, gdy lokalizacja jest dostępna*. Zimne wejście nie może być posortowane po odległości dla nikogo — przeglądarka musi najpierw poprosić o zgodę na geolokalizację. Do tego czasu obowiązuje 1.2.

2. IF the User's location is not available, THEN THE System SHALL display the list of Lunch_Offers sorted alphabetically by restaurant name and SHALL hide the distance field for each offer
3. THE System SHALL display for each Lunch_Offer: restaurant name, dish name, price (with currency), description (maximum 150 characters), and distance from User (if location is available)
4. WHEN a User selects a Lunch_Offer, THE System SHALL display full details including allergens, dietary tags, and restaurant address
5. WHILE no Lunch_Offers are available for the current day, THE System SHALL display a message informing the User that no offers are currently available

### Requirement 2: Filtrowanie i sortowanie ofert

**User Story:** As a User, I want to filter and sort lunch offers, so that I can quickly find meals matching my preferences.

#### Acceptance Criteria

1. WHEN a User applies a distance filter, THE System SHALL display only Lunch_Offers from restaurants within the specified radius (selectable from 0.5 km to 25 km) calculated from the User's current location
2. WHEN a User applies a price filter, THE System SHALL display only Lunch_Offers with a price within the specified minimum and maximum range (from 0.01 to 999.99 in local currency)
3. WHEN a User applies a cuisine type filter, THE System SHALL display only Lunch_Offers matching at least one of the selected cuisine categories
4. WHEN a User applies a dietary filter, THE System SHALL display only Lunch_Offers matching all of the selected dietary requirements (vegetarian, vegan, gluten-free)
5. WHEN a User enters a search query of at least 2 characters, THE System SHALL display Lunch_Offers where the dish name or description contains the query text (case-insensitive, partial match) and update results within 1 second
6. WHEN a User selects a sort option, THE System SHALL order Lunch_Offers according to the selected criterion (price ascending, price descending, distance from User, newest by publication date)
7. WHEN a User applies multiple filters simultaneously, THE System SHALL display only Lunch_Offers satisfying all active filter conditions (AND logic)
8. IF no Lunch_Offers match the applied filters, THEN THE System SHALL display an empty-state message indicating that no offers match the current filter criteria and suggest adjusting the filters
9. THE System SHALL represent the active filters, the selected day and the current page in the URL query string, so that a filtered listing is shareable, survives a reload, and is rendered correctly on the server's first paint
   - The URL is the single source of truth for filter state. It is not a mirror of component state, and no filter lives only in memory.
   - Covered: distance radius, price minimum and maximum, cuisine types, dietary tags, search query, sort order, date and page. `limit` is excluded — no User chooses it, and exposing it would only publish an internal constant.
   - A User's coordinates SHALL NOT appear in the URL. They are held in a cookie and passed to the client by the server, because a query string reaches browser history, server logs, analytics and the `Referer` header on every outbound click.
10. WHEN a User changes a filter, THEN THE System SHALL add a history entry so the browser Back control undoes that change
    - Exception: the search box uses a debounced URL replacement rather than a push, so that typing does not produce one history entry per keystroke.
11. WHEN a User changes any filter other than the page number, THEN THE System SHALL reset the page number to 1
12. IF a URL requests distance sorting or a distance radius and the System has no location for the User, THEN THE System SHALL **keep the parameters in the URL** and display a message that distance filtering requires a location, offering geolocation or manual address entry
    - The parameters must not be stripped. Stripping breaks the link for re-sharing, and `permissionState` has three values (`granted`, `denied`, `prompt`) of which the server is aware of none — stripping while the browser is still asking for permission would discard filters before the User can accept.
13. WHEN a Visitor authenticates from a filtered listing, THE System SHALL return the User to the same filters after sign-in

### Requirement 3: Geolokalizacja

**User Story:** As a User, I want the app to suggest using my location, so that I can see restaurants sorted by distance.

#### Acceptance Criteria

1. WHEN a User opens the application and has not previously responded to the geolocation prompt in the current browser, THE System SHALL display a prompt proposing to use geolocation to sort offers by distance
2. WHEN a User grants location permission, THE Location_Service SHALL determine the User's current coordinates using the browser Geolocation API within 10 seconds
3. IF the browser Geolocation API fails to return coordinates within 10 seconds or returns an error, THEN THE System SHALL display a message indicating that location could not be determined and offer the option to manually enter an address
4. WHEN the User's location is available, THE System SHALL sort Lunch_Offers by distance from the User in ascending order and display the distance in kilometers rounded to one decimal place
5. IF a User denies location permission, THEN THE System SHALL display an address input field allowing the User to manually enter an address of up to 200 characters
6. IF a User submits a manual address that cannot be resolved to geographic coordinates, THEN THE System SHALL display a message indicating the address could not be found and allow the User to re-enter the address
7. THE Location_Service SHALL calculate straight-line distances in kilometers between the User's coordinates and each restaurant's coordinates

### Requirement 4: Rekomendacje AI w ramach sesji

**User Story:** As a User, I want to ask for AI-powered meal recommendations in a chat window, so that I can get suggestions for today's lunch without browsing manually.

#### Acceptance Criteria

1. WHEN a User opens the recommendation chat, THE System SHALL display a chat interface where the User can describe preferences in natural language
2. WHEN a User sends a message describing preferences (e.g., "chcę coś lekkiego i taniego"), THE AI_Recommender SHALL respond within 10 seconds with 1 to 5 Lunch_Offers from today's available offers that match the stated preferences
3. WHEN the AI_Recommender returns recommendations, THE AI_Recommender SHALL provide a natural language explanation for each recommended Lunch_Offer stating why it matches the User's preferences
4. THE AI_Recommender SHALL filter and prioritize recommendations based on dietary restrictions, price preferences, and location when these are stated by the User in the conversation
5. THE AI_Recommender SHALL maintain conversation context within the current session only, supporting up to 50 messages per session, without persisting history between sessions
6. IF no Lunch_Offers match the User's stated preferences, THEN THE AI_Recommender SHALL inform the User that no matching offers are available and suggest broadening the criteria
7. IF the AI_Recommender service is unavailable, THEN THE System SHALL display an error message indicating the recommendation service is temporarily unavailable and suggest the User try again later

### Requirement 5: Dodawanie ofert przez użytkowników

**User Story:** As a User with a logged-in account, I want to add lunch offers by pasting links, text, or photos, so that the community can benefit from shared information about lunch deals.

Anonimowe dodawanie ofert zostało świadomie wycofane — patrz Introduction. Kryteria poniżej nie zmieniają się: każde z nich czyta się jako „WHEN a User…", czyli wymaga konta.

#### Acceptance Criteria

1. WHEN a User pastes a URL to a restaurant menu page, THE AI_Analyzer SHALL extract lunch offer details (dish names, prices, descriptions) from the linked page and create structured Lunch_Offers containing at minimum a restaurant name, at least one dish name, and a price per dish
2. WHEN a User pastes text (up to 5000 characters) containing lunch offer information, THE AI_Analyzer SHALL parse the text and create structured Lunch_Offers containing at minimum a restaurant name, at least one dish name, and a price per dish
3. WHEN a User uploads a photo (JPEG, PNG, or WebP, max 10 MB) of a menu or lunch offer, THE AI_Analyzer SHALL perform OCR and content analysis to extract offer details and create structured Lunch_Offers containing at minimum a restaurant name, at least one dish name, and a price per dish
4. WHEN the AI_Analyzer completes extraction from user input, THE System SHALL present the extracted offers to the User for review and confirmation before making them visible to other users
5. IF the AI_Analyzer cannot extract the minimum required fields (restaurant name, at least one dish name, and price) from the provided input, THEN THE System SHALL display an error message indicating which required fields could not be identified and allow the User to provide the missing details manually
6. THE System SHALL associate each user-submitted Lunch_Offer with the source type (link, text, or photo)
7. THE System SHALL allow a User to edit all AI-extracted offer fields (restaurant name, dish names, prices, descriptions) before confirming publication
8. IF the AI_Analyzer extracts partial information (some required fields present, others missing), THEN THE System SHALL present the successfully extracted fields pre-filled and highlight the missing required fields for the User to complete manually

### Requirement 6: Zarządzanie ofertami

**User Story:** As a User, I want to manage lunch offers I have added, so that I can keep information up to date.

#### Acceptance Criteria

1. WHEN a User submits a confirmed Lunch_Offer, THE System SHALL store the offer in the database and make it visible on the main listing within 5 seconds
2. THE System SHALL require each Lunch_Offer to include: dish name (maximum 100 characters), price (from 0.01 to 9999.99 in PLN), restaurant name (maximum 100 characters), and available date (a single calendar date, today or in the future, up to 30 days ahead). **Inwariant:** nazwa restauracji zapisana na ofercie jest źródłem prawdy dla wyświetlania — zmiana nazwy w `restaurants` nie zmienia tego, co widać na liście. `restaurant_id` jest opcjonalne i może być `null`; semantyka tego powiązania należy do specyfikacji `restaurant-management`, nie do tej
3. THE System SHALL allow optional fields for each Lunch_Offer: description (maximum 500 characters), cuisine type (one selection from a predefined list), dietary tags (up to 5 selections from a predefined list), allergens (up to 10 selections from a predefined list), and restaurant address (maximum 200 characters)
4. WHEN a User provides a restaurant address, THE System SHALL geocode the address to obtain geographic coordinates for distance calculations
5. IF the System cannot geocode a provided restaurant address, THEN THE System SHALL store the Lunch_Offer without coordinates and display a message indicating that distance-based sorting will not be available for this offer
6. IF a User submits a Lunch_Offer with missing or invalid required fields, THEN THE System SHALL reject the submission, highlight the invalid fields, and display a message indicating what correction is needed
7. WHEN a User selects a Lunch_Offer they previously submitted, THE System SHALL allow the User to edit all fields or delete the offer from the listing. Ownership is by authenticated account and never by session token — `session_token` survives only as the legacy migration concept

### Requirement 7: Responsywność

**User Story:** As a User, I want the application to be usable on mobile devices, so that I can check lunch offers on the go.

#### Acceptance Criteria

1. THE System SHALL provide a responsive layout in which **no content is clipped or made unreachable** at any screen width from 320px to 2560px, and which does not require zooming
   - *Reachability, not the absence of a scrollbar.* The previous wording — "without horizontal scrolling" — could not be tested: `overflow-x-hidden` on the root element makes the document never report a scrollbar regardless of what overflows, so a test asserting `scrollWidth <= clientWidth` passes on any layout, however broken. That is not a hypothetical; it was the state of this repository. The requirement is about content being reachable, which is observable.
2. THE System SHALL render all features fully functional, without layout breaks or JavaScript errors, in the latest two versions of Chromium-based browsers (Chrome and Edge)
   - **Scope note.** Firefox and WebKit are not covered. This is a hobby project and the cost is not worth it: those browsers need separate multi-hundred-megabyte downloads, and neither engine had been exercised by any spec in this repository, so the coverage was always nominal rather than real. Two of the four original engines are genuinely tested; the requirement now claims only those two.
   - Known and accepted: a layout break or script error specific to Firefox or Safari will not be caught here. Anyone reporting one should add `firefox` or `webkit` to `playwright.config.ts` and run it.
3. WHILE the viewport width is 768px or less, THE System SHALL provide interactive elements (buttons, links, form controls) with a minimum target size of 24x24 CSS pixels and a minimum spacing of 8px between adjacent targets
   - **Links rendered inline within a sentence are exempt from the size minimum**, per WCAG 2.2 SC 2.5.8. "Masz już konto? Zaloguj się" is a link inside a sentence, not a control in a toolbar.
   - *Why 24 and not 44.* 24x24 is the WCAG 2.2 level AA threshold. 44x44 is an Apple HIG figure and the WCAG 2.1 AAA threshold; measured against this application it produced 54 findings, where 24x24 produces none once the inline-link exemption applies. Holding 44 would mean rebuilding every UI primitive to satisfy a level the specification never asked for.
4. WHILE the viewport width is 768px or less, THE System SHALL display **inherited** body text at a minimum font size of 16px to ensure readability without zooming
   - **Explicit font-size utilities take precedence over this rule, deliberately.** `text-sm` and `text-xs` on a component mean that component is 14px or 12px, and that is a design decision, not a defect.
   - **The exception is text a User must read to complete a task**: required-field markers, form labels, and control labels. These are not exempt.
   - *Why this is worded this way.* The previous wording set a minimum for "body text" while the only mechanism enforcing it — a `font-size: 16px` rule on the root — loses to every explicit utility. As written the requirement was satisfiable by being consistently unreadable. Stating the precedence makes the rule enforceable where it was never going to be overridden, and stops pretending it is enforced elsewhere.

> **Notes on 7.3 and 7.4.** Both state 768px. They are written as two independent rules rather than one shared threshold, so that moving the threshold later moves them independently. They are not both tied to the `md` breakpoint: the desktop navigation was measured as the *worst* width for both target size and font size, and it now starts at `lg` (1024px) for that reason, leaving the mobile menu — which already meets both rules — in place below it.

### Requirement 8: Przypisanie restauracji oraz „Moje oferty" i wznowienie menu

**User Story:** As a User who adds lunch offers for a restaurant, I want every published offer assigned to a restaurant and the current menu renewed with one click, so that offers stay traceable per restaurant and the listing stays current without re-pasting the same menu every week.

> Decyzje ustalone w [#68](https://github.com/wojciech94/lunchagregator/issues/68): restaurant-first przy ekstrakcji, flaga tygodniowa na restauracji (bez automatyzacji), wznowienie jako okno + mapowanie +7. Mechanika w `design.md`, sekcja „Przypisanie restauracji, „Moje oferty" i wznowienie".

#### Acceptance Criteria

1. WHEN an AI extraction completes and its restaurant does not deterministically match an existing restaurant, THE System SHALL require the User to assign an existing restaurant or create a new one (name prefilled from the extraction, address required) before any offer form opens
2. WHEN the extraction matches exactly one existing restaurant — or exactly one result carries an exact normalized-name hit — THE System SHALL preselect that restaurant and let the User confirm it
3. WHEN a User publishes an assigned offer, THE System SHALL copy the assigned restaurant's name and address onto the offer as its snapshot; **inwariant 6.2 bez zmian** — późniejsza edycja restauracji nie przepisuje opublikowanych ofert
4. WHEN an authenticated User opens „Moje oferty", THE System SHALL display the User's own offers grouped by restaurant, split into nadchodzące (`available_date >= today`) and wygasłe (`available_date < today`), 50 per section; offers with no restaurant SHALL appear in a separate group with a hint to re-add the menu through the restaurant-first flow
5. WHEN a User invokes wznowienie for a restaurant, THE System SHALL create one new offer per eligible source offer — the User's own offers of that restaurant with `available_date` from 7 days before today through 6 days ahead — dated **source date + 7 days**, copying dish fields verbatim and the address snapshot and coordinates from the restaurant's current row, without geocoding
   - *Why `+7`, not the next occurrence of the weekday.* Menus typically run Monday–Friday and are renewed weekly. `nextDateForDay` breaks a mid-week renewal: renewing on Wednesday picks up only the expired Mon/Tue dishes and silently drops Wed–Fri from next week's menu. Within the window, `+7` preserves the weekday structure exactly and can never land in the past: the oldest source (today − 7) maps to today, the newest (today + 6) to today + 13, both inside the INSERT trigger's bounds. `nextDateForDay` remains the convention only where it already lived — weekly-menu publishing in the add flow.
   - *Why the window ends at today + 6.* It bounds the renewal to "the current menu week". Sources older than seven days are history, not the current menu; renewing over the full expired history would resurrect dishes the User deliberately dropped, and the dedupe rule cannot tell a dropped dish from an omitted one.
   - *Implementation refinement: the anchor rule.* The window alone still resurrects a dropped dish when today is Monday — last Monday's rows fall inside `today − 7`. The implementation therefore renews **the newest menu week**: `anchor` = the newest `available_date` among the User's own offers *within the window* (offers scheduled beyond today + 6 are future weeks, not the current menu), and sources are `[anchor − 6, anchor]` — seven days containing every weekday exactly once. A dish absent from the newest week is absent on purpose; targets land in `[anchor + 1, anchor + 7]`, and a target that falls before today (a late renewal) is skipped and reported rather than rejected by the trigger. Property tests pin the bounds; see `src/lib/offer-renewal.ts`.
6. IF an offer with the same restaurant, dish name and target date already exists for the User, THEN THE System SHALL skip that item and report the skip in the renewal summary
   - Overlapping windows make this normal, not exceptional: a Monday renewal maps last week's dishes onto existing rows (skipped, reported) while this week's rows create next week's menu. One click per week is the intended rhythm.
7. THE System SHALL allow the owner — and an admin — to mark a restaurant as carrying its menu week to week and to revoke the mark („do odwołania"); while marked and its menu is expired, THE System SHALL surface it first on „Moje oferty" as a menu to renew; THE System SHALL NOT renew anything automatically
   - *Flaga to marker intencji, nie wyzwalacz.* Brak crona, brak materializacji w tle — świadoma decyzja v1; automatyzacja byłaby osobną decyzją, nie dopiskiem.
8. Assignment and renewal require an authenticated User; a Visitor is returned to sign-in with a return path, as in 2.13
9. THE System SHALL NOT attach a restaurant to an existing offer post-hoc (decyzja #18 obowiązuje) and SHALL NOT delete or migrate dead offers automatically
   - Oferty bez restauracji są martwe i zostają martwe; śledzenie zaczyna się od nowego flow. Admin nadal może edytować dowolny rekord w panelu.
