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
   - URL jest jedynym źródłem prawdy dla stanu filtrów. Nie jest lustrem stanu komponentu i żaden filtr nie żyje wyłącznie w pamięci.
   - Obejmuje: promień odległości, minimum i maksimum ceny, typy kuchni, tagi dietetyczne, zapytanie wyszukiwania, kolejność sortowania, datę i stronę. `limit` jest wyłączony — żaden User go nie wybiera, a ujawnienie go publikowałoby jedynie wewnętrzną stałą.
   - Współrzędne Usera NIE MOGĄ pojawiać się w URL. Są trzymane w ciasteczku i przekazywane klientowi przez serwer, ponieważ query string trafia do historii przeglądarki, logów serwera, analityki i nagłówka `Referer` przy każdym kliknięciu wychodzącym.
10. WHEN a User changes a filter, THEN THE System SHALL add a history entry so the browser Back control undoes that change
    - Wyjątek: pole wyszukiwania używa opóźnionego zastąpienia URL zamiast `push`, żeby pisanie nie tworzyło jednego wpisu w historii na naciśnięcie klawisza.
11. WHEN a User changes any filter other than the page number, THEN THE System SHALL reset the page number to 1
12. IF a URL requests distance sorting or a distance radius and the System has no location for the User, THEN THE System SHALL **keep the parameters in the URL** and display a message that distance filtering requires a location, offering geolocation or manual address entry
    - Parametrów nie wolno usuwać. Usunięcie psuje link przy ponownym udostępnianiu, a `permissionState` ma trzy wartości (`granted`, `denied`, `prompt`), z których serwer nie zna żadnej — usunięcie, gdy przeglądarka wciąż pyta o zgodę, zgubiłoby filtry, zanim User zdążyłby zaakceptować.
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

**User Story:** As a User, I want to ask for AI-powered meal recommendations in a chat window, so that I can get suggestions for today or a requested future date or period without browsing manually.

#### Acceptance Criteria

1. WHEN a User opens the recommendation chat, THE System SHALL display a chat interface where the User can describe preferences in natural language
2. WHEN a User sends a message describing preferences (e.g., "chcę coś lekkiego i taniego"), THE AI_Recommender SHALL respond within a total budget of 25 seconds with 1 to 5 Lunch_Offers from published offers in the resolved search period that match the stated preferences. The budget covers conversational intent resolution, offer retrieval, streaming, and an optional alternate-model attempt after HTTP 429, and SHALL NOT reset between stages or when switching models.
3. WHEN the AI_Recommender returns recommendations, THE AI_Recommender SHALL provide a natural language explanation for each recommended Lunch_Offer stating why it matches the User's preferences, its availability date and weekday, and the searched period
4. THE AI_Recommender SHALL filter and prioritize recommendations based on dietary restrictions, price preferences, and location when these are stated by the User in the conversation
5. THE AI_Recommender SHALL maintain conversation context within the current session only, supporting up to 50 messages per session, without persisting history between sessions
6. IF no Lunch_Offers match the User's stated preferences, THEN THE AI_Recommender SHALL identify the searched period and suggest broadening the criteria. It SHALL disclose incomplete coverage and SHALL NOT claim an exhaustive absence of matches from a truncated sample or a failed query, nor infer a restaurant's actual menu from missing published data
7. IF the AI_Recommender service is unavailable, THEN THE System SHALL display an error message indicating the recommendation service is temporarily unavailable and suggest the User try again later

8. THE System SHALL resolve dates in Europe/Warsaw. With no user-selected period, default to today. Support tomorrow, an unqualified weekday (its next occurrence, including today), explicit dates/ranges, this week (today through Sunday), and next week (following Monday through Sunday).
9. THE System SHALL retain the last user-selected period as an absolute date range for conversational follow-ups, including across Europe/Warsaw midnight and week boundaries, and replace it when a later user request specifies another period. Earlier relative expressions SHALL NOT be reevaluated against the follow-up date. The unspecified default remains the current today. Ambiguous date requests SHALL receive a clarification rather than a silent fallback.
10. THE supported window SHALL be today through today + 30 calendar days, inclusive. Invalid, reversed, past-only, and wholly unsupported ranges SHALL receive an explanation without querying offers. Partly supported ranges SHALL be clipped to the supported window and the searched portion SHALL be disclosed.
11. THE System SHALL apply explicit dietary, cuisine, and price criteria before pagination; retrieve beyond the first page when needed; bound database work/model context; and represent every searched date fairly. Truncation SHALL be disclosed by date.

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
   - *Dostępność treści, nie brak paska przewijania.* Poprzednie sformułowanie — „bez poziomego przewijania" — nie dało się przetestować: `overflow-x-hidden` na elemencie głównym sprawia, że dokument nigdy nie zgłasza paska przewijania, niezależnie od tego, co wystaje, więc test `scrollWidth <= clientWidth` przechodzi dla dowolnego layoutu, choćby zepsutego. To nie hipoteza — taki był stan tego repozytorium. Wymaganie dotyczy osiągalności treści, która jest obserwowalna.
2. THE System SHALL render all features fully functional, without layout breaks or JavaScript errors, in the latest two versions of Chromium-based browsers (Chrome and Edge)
   - **Uwaga o zakresie.** Firefox i WebKit nie są objęte. To projekt hobbystyczny i koszt się nie opłaca: te przeglądarki wymagają osobnych, kilkusetmegabajtowych pobrań, a żaden z tych silników nie był ćwiczony przez żadną specyfikację w tym repozytorium, więc pokrycie było zawsze nominalne, a nie rzeczywiste. Dwa z czterech pierwotnych silników są naprawdę testowane; wymaganie obejmuje obecnie tylko te dwa.
   - Znane i zaakceptowane: błąd layoutu lub błąd skryptu specyficzny dla Firefoksa lub Safari nie zostanie tu wychwycony. Zgłaszający taki problem powinien dodać `firefox` lub `webkit` do `playwright.config.ts` i uruchomić test.
3. WHILE the viewport width is 768px or less, THE System SHALL provide interactive elements (buttons, links, form controls) with a minimum target size of 24x24 CSS pixels and a minimum spacing of 8px between adjacent targets
   - **Linki renderowane w treści zdania są zwolnione z minimum rozmiaru**, zgodnie z WCAG 2.2 SC 2.5.8. „Masz już konto? Zaloguj się" to link wewnątrz zdania, a nie kontrolka na pasku narzędzi.
   - *Dlaczego 24, a nie 44.* 24x24 to próg WCAG 2.2 poziomu AA. 44x44 to wartość z Apple HIG i próg WCAG 2.1 AAA; zmierzony w tej aplikacji dał 54 znaleziska, podczas gdy 24x24 nie daje żadnego po zastosowaniu wyjątku dla linków w treści. Utrzymanie 44 oznaczałoby przebudowę każdego elementu UI, by spełnić poziom, którego specyfikacja nigdy nie wymagała.
4. WHILE the viewport width is 768px or less, THE System SHALL display **inherited** body text at a minimum font size of 16px to ensure readability without zooming
   - **Jawne klasy rozmiaru czcionki mają pierwszeństwo przed tą regułą — celowo.** `text-sm` i `text-xs` na komponencie oznaczają, że komponent ma 14px lub 12px, i to jest decyzja projektowa, a nie defekt.
   - **Wyjątkiem jest tekst, który User musi przeczytać, aby ukończyć zadanie**: znaczniki pól wymaganych, etykiety formularzy i etykiety kontrolek. Te nie są zwolnione.
   - *Dlaczego takie sformułowanie.* Poprzednie sformułowanie ustalało minimum dla „tekstu treści", a jedyny mechanizm egzekwujący — reguła `font-size: 16px` na elemencie głównym — przegrywa z każdą jawną klasą. Jak zapisano, wymaganie dało się spełnić przez konsekwentną nieczytelność. Wskazanie pierwszeństwa czyni regułę egzekwowalną tam, gdzie i tak nigdy nie miałaby być nadpisana, i przestaje udawać, że jest egzekwowana gdzie indziej.

> **Uwagi do 7.3 i 7.4.** Oba mówią o 768px. Zapisano je jako dwie niezależne reguły, a nie jeden wspólny próg, aby późniejsza zmiana progu przesuwała je niezależnie. Nie są obie powiązane z breakpointem `md`: nawigacja desktopowa była mierzona jako *najgorsza* szerokość dla rozmiaru celu i czcionki, więc z tego powodu zaczyna się teraz od `lg` (1024px), zostawiając poniżej menu mobilne — które już spełnia obie reguły.

### Requirement 8: Przypisanie restauracji oraz „Moje oferty" i wznowienie menu

**User Story:** As a User who adds lunch offers for a restaurant, I want every published offer assigned to a restaurant and the current menu renewed with one click, so that offers stay traceable per restaurant and the listing stays current without re-pasting the same menu every week.

> Decyzje ustalone w [#68](https://github.com/wojciech94/lunchagregator/issues/68): restaurant-first przy ekstrakcji, flaga tygodniowa na restauracji (od #139 wyliczana z harmonogramu menu cyklicznego), wznowienie jako okno + mapowanie +7. Mechanika w `design.md`, sekcja „Przypisanie restauracji, „Moje oferty" i wznowienie".

#### Acceptance Criteria

1. WHEN an AI extraction completes and its restaurant does not deterministically match an existing restaurant, THE System SHALL require the User to assign an existing restaurant or create a new one (name prefilled from the extraction, address required) before any offer form opens
2. WHEN the extraction matches exactly one existing restaurant — or exactly one result carries an exact normalized-name hit — THE System SHALL preselect that restaurant and let the User confirm it
3. WHEN a User publishes an assigned offer, THE System SHALL copy the assigned restaurant's name and address onto the offer as its snapshot; **inwariant 6.2 bez zmian** — późniejsza edycja restauracji nie przepisuje opublikowanych ofert
4. WHEN an authenticated User opens „Moje oferty", THE System SHALL display the User's own offers grouped by restaurant, split into nadchodzące (`available_date >= today`) and wygasłe (`available_date < today`), 50 per section; offers with no restaurant SHALL appear in a separate group with a hint to re-add the menu through the restaurant-first flow
5. WHEN a User invokes wznowienie for a restaurant, THE System SHALL create one new offer per eligible source offer — the User's own offers of that restaurant with `available_date` from 7 days before today through 6 days ahead — dated **source date + 7 days**, copying dish fields verbatim and the address snapshot and coordinates from the restaurant's current row, without geocoding
   - *Dlaczego `+7`, a nie najbliższe wystąpienie dnia tygodnia.* Menu zwykle działa pon–pt i jest odnawiane co tydzień. `nextDateForDay` psuje wznowienie w środku tygodnia: wznowienie w środę podnosi tylko wygasłe dania pon/wt i po cichu gubi śr–pt z przyszłotygodniowego menu. W obrębie okna `+7` dokładnie zachowuje strukturę dni i nigdy nie ląduje w przeszłości: najstarsze źródło (dziś − 7) mapuje się na dziś, najnowsze (dziś + 6) na dziś + 13, oba w granicach triggera INSERT. `nextDateForDay` pozostaje konwencją tylko tam, gdzie już żyła — publikacja weekly-menu w flow dodawania.
   - *Dlaczego okno kończy się na dziś + 6.* Ogranicza wznowienie do „bieżącego tygodnia menu". Źródła starsze niż siedem dni to historia, nie bieżące menu; wznowienie po pełnej wygasłej historii przywróciłoby dania, które User celowo usunął, a reguła dedupe nie odróżnia dania usuniętego od pominiętego.
   - *Doprecyzowanie implementacji: reguła kotwicy.* Samo okno wciąż przywraca usunięte danie, gdy dziś jest poniedziałek — wiersze zeszłego poniedziałku mieszczą się w `today − 7`. Implementacja odnawia więc **najnowszy tydzień menu**: `anchor` = najnowsza `available_date` wśród własnych ofert Usera *w obrębie okna* (oferty zaplanowane dalej niż dziś + 6 to przyszłe tygodnie, nie bieżące menu, i są ignorowane), a źródłami są oferty z `[anchor − 6, anchor]` — siedem dni zawierających każdy dzień tygodnia dokładnie raz. Danie nieobecne w najnowszym tygodniu jest nieobecne celowo; cele lądują w `[anchor + 1, anchor + 7]`, a cel wypadający przed dziś (późne wznowienie) jest pomijany i raportowany, a nie odrzucany przez trigger. Testy property przypinają granice; patrz `src/lib/offer-renewal.ts`.
6. IF an offer with the same restaurant, dish name and target date already exists for the User, THEN THE System SHALL skip that item and report the skip in the renewal summary
   - Nakładające się okna są normalne, a nie wyjątkowe: wznowienie w poniedziałek mapuje zeszłotygodniowe dania na istniejące wiersze (pomijane, raportowane), a wiersze bieżącego tygodnia tworzą menu następnego. Jedno kliknięcie na tydzień to zamierzony rytm.
7. Owners and admins SHALL configure explicit recurring schedules with fixed or weekday-specific menus, effective revisions, stopping/resuming and date exceptions. Activated schedules SHALL publish automatically and maintain a 30-date horizon; existing flags alone SHALL NOT activate recurrence (#139 supersedes the manual-only behavior from #71). Closure takes precedence over a complete date replacement, which takes precedence over normal offers. Public listing, totals and detail access SHALL agree. The business calendar is Europe/Warsaw.
8. Assignment and renewal require an authenticated User; a Visitor is returned to sign-in with a return path, as in 2.13
9. THE System SHALL NOT re-link a published offer to a different restaurant, and SHALL NOT delete or migrate old offers automatically
   - *Zmienione w #74.* Pierwotnie: „bez doczepiania post-hoc" (decyzja #18). Legacy kafelek okazał się backlogiem, nie archiwum, a jedyna ścieżka — „dodaj menu jeszcze raz" — była ceną nieproporcjonalną. Teraz właściciel MAY doczepić własne oferty bez restauracji (kafelk „Bez restauracji" → subgrupy po nazwie snapshota → przypisanie), ale **attach-when-null tylko**: oferta z przypisaną restauracją nie jest nigdy przepinana ani odrywana — #18 zostaje w mocy. Snapshot nie jest przepisywany (Req 6.2): link służy śledzeniu i wznowieniu, nie wyświetlaniu. Admin nadal może edytować dowolny rekord w panelu.


### Rozszerzenie: menu cykliczne (#139)

Publikacja daje jawny wybór między jednorazowością a powtarzaniem, sugerowane i edytowalne dni tygodnia oraz podgląd przyszłych dni na żywo. „Moje menu" pokazuje jedną kartę restauracji z akcjami edycji, pominięcia/zastąpienia dnia oraz zatrzymania/wznowienia powtarzania; wygenerowane oferty są zarządzane przez swój harmonogram. Odwiedzający mogą przeglądać 14 dni, w tym następny poniedziałek, gdy dziś jest poniedziałek. Historyczne dania, ceny i snapshoty oraz niezależne publikacje jednorazowe pozostają nienaruszone. Stare flagi wymagają skonfigurowania harmonogramu potwierdzonego przez właściciela; przyszłe oferty źródłowe można jawnie wybrać do zastąpienia, bez po cichu przejmowania niepowiązanych wierszy. Implementację i wdrożenie opisują `docs/adr/0001-recurring-menu-materialization.md` oraz `docs/agents/recurring-menus.md`.
