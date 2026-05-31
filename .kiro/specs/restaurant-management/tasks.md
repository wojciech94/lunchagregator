# Tasks

## Task 1: Database Schema & Migration

- [x] 1.1 Create Supabase migration file `supabase/migrations/20240201000000_create_restaurants.sql` with the `restaurants` table definition including all columns, constraints (name length, description length, address/location check, lunch hours validity), and indexes (name, session_token, location GIST, price_level, cuisine_types GIN, full-text search)
- [x] 1.2 Add `restaurant_id` nullable FK column to `lunch_offers` table with `ON DELETE SET NULL` and create index `idx_offers_restaurant`
- [x] 1.3 Create `get_restaurants_within_radius` PostgreSQL function using PostGIS for spatial queries
- [x] 1.4 Run migration locally and verify schema is correct

## Task 2: TypeScript Types & Validation Schemas

- [x] 2.1 Create `src/types/restaurants.ts` with interfaces: `Restaurant`, `RestaurantWithDistance`, `RestaurantSummary`, `CreateRestaurantInput`, `UpdateRestaurantInput`, `RestaurantFilters`, `PaginatedRestaurants`, `PriceLevel`, `LunchHours`
- [x] 2.2 Create `src/schemas/restaurant.schema.ts` with Zod schemas: `lunchHoursSchema`, `createRestaurantSchema`, `updateRestaurantSchema` including all validation rules (name 2-100 chars, description max 500, address max 200, phone max 20, URL max 500, lunch hours time ranges and ordering)
- [x] 2.3 Create `src/utils/lunch-hours-formatter.ts` with functions: `formatLunchHours(hours: LunchHours): string` and `parseLunchHours(formatted: string): LunchHours | null`
- [x] 2.4 Update `src/types/offers.ts` to add optional `restaurantId` field to `LunchOffer` interface

## Task 3: Property-Based Tests — Validation

- [x] 3.1 Write property test for restaurant validation (Property 1): generate arbitrary inputs and verify acceptance/rejection based on field constraints
- [x] 3.2 Write property test for lunch hours validation (Property 2): generate time pairs and verify correct acceptance/rejection based on format, range, and ordering rules
- [x] 3.3 Write property test for lunch hours display format round-trip (Property 3): format then parse should return original value

## Task 4: Server Actions — Restaurant CRUD

- [x] 4.1 Create `src/actions/restaurants.ts` with `createRestaurant` server action: validate input with Zod, geocode address if provided, insert into Supabase, return ActionResult
- [x] 4.2 Add `updateRestaurant` server action: verify ownership (session token match), validate input, re-geocode if address changed, update in Supabase
- [x] 4.3 Add `deleteRestaurant` server action: verify ownership, check for associated offers, snapshot restaurant data into offers if needed (copy name/address/location to offer fields where restaurant_id matches), then delete restaurant
- [x] 4.4 Add `listRestaurants` server action: query with filters (distance, price level, cuisine, lunch hours, text search), sort alphabetically, paginate (max 50)
- [x] 4.5 Add `getRestaurant` server action: fetch single restaurant with active offers count
- [x] 4.6 Add `searchRestaurants` server action: lightweight search returning RestaurantSummary[] for the dropdown in offer form

## Task 5: Property-Based Tests — Ownership & Listing

- [x] 5.1 Write property test for session-based ownership enforcement (Property 4): generate restaurant/token pairs and verify access control
- [x] 5.2 Write property test for restaurant listing sort and pagination (Property 5): generate restaurant sets and verify alphabetical order + max 50 limit

## Task 6: Property-Based Tests — Filtering

- [x] 6.1 Write property test for distance filter invariant (Property 6): generate restaurants with locations, user location, and radius — verify all returned are within radius
- [x] 6.2 Write property test for price level filter OR logic (Property 7): generate restaurants and price level subsets — verify returned match at least one selected level
- [x] 6.3 Write property test for cuisine type filter OR logic (Property 8): generate restaurants and cuisine subsets — verify returned have at least one matching cuisine
- [x] 6.4 Write property test for lunch hours time containment (Property 9): generate restaurants with lunch hours and query time — verify containment
- [x] 6.5 Write property test for text search containment (Property 10): generate restaurants and queries — verify name/description contains query
- [x] 6.6 Write property test for combined filters intersection (Property 11): generate restaurants and filter combinations — verify combined ⊆ intersection of individual

## Task 7: Property-Based Tests — Offer-Restaurant Association

- [x] 7.1 Write property test for offer snapshot immutability on restaurant update (Property 12): create restaurant + offers, update restaurant, verify offers unchanged
- [x] 7.2 Write property test for auto-populate offer fields from restaurant (Property 13): select restaurant, verify offer fields match restaurant data
- [x] 7.3 Write property test for offer data preservation on restaurant deletion (Property 14): delete restaurant, verify offers retain data and restaurant_id is NULL

## Task 8: UI Components — Restaurant Form

- [x] 8.1 Create `src/components/restaurants/LunchHoursInput.tsx`: time picker pair with validation feedback (start/end, HH:MM format)
- [x] 8.2 Create `src/components/restaurants/RestaurantForm.tsx`: form with all fields (name, description, address, price level, lunch hours, cuisine types, phone, URL), client-side validation with Zod, geocoding trigger on address blur
- [x] 8.3 Create `src/components/restaurants/RestaurantSelect.tsx`: searchable dropdown for selecting existing restaurant in offer form, with debounced search calling `searchRestaurants`

## Task 9: UI Components — Restaurant List & Detail

- [x] 9.1 Create `src/components/restaurants/RestaurantCard.tsx`: display name, price level badge, cuisine types, lunch hours, distance
- [x] 9.2 Create `src/components/restaurants/RestaurantList.tsx`: paginated list with empty state
- [x] 9.3 Create `src/components/restaurants/RestaurantFilters.tsx`: filter panel (distance slider, price level checkboxes, cuisine checkboxes, lunch time picker, search input)
- [x] 9.4 Create `src/components/restaurants/RestaurantDetail.tsx`: full details view with associated offers list and edit/delete buttons (visible only for owner)

## Task 10: Pages & Routing

- [x] 10.1 Create `src/app/restaurants/page.tsx`: Server Component rendering RestaurantList with filters
- [x] 10.2 Create `src/app/restaurants/[id]/page.tsx`: Server Component rendering RestaurantDetail
- [x] 10.3 Create `src/app/restaurants/new/page.tsx`: Client page with RestaurantForm for creation
- [x] 10.4 Update `src/components/NavHeader.tsx`: add "Restauracje" link to navigation

## Task 11: Offer Form Integration

- [x] 11.1 Update `src/components/add-offer/OfferForm.tsx`: add RestaurantSelect dropdown above restaurant name field, auto-populate restaurant fields when selection is made
- [x] 11.2 Update `src/actions/offers.ts`: handle `restaurant_id` in offer creation — store FK and copy restaurant data as snapshot
- [x] 11.3 Ensure backward compatibility: offers without `restaurant_id` continue to work with manually entered restaurant data

## Task 12: Unit & Integration Tests

- [x] 12.1 Write unit tests for `lunch-hours-formatter.ts` (format/parse edge cases)
- [x] 12.2 Write unit tests for restaurant Zod schemas (specific valid/invalid examples)
- [x] 12.3 Write integration tests for restaurant CRUD server actions (with mocked Supabase)
- [x] 12.4 Write integration tests for restaurant-offer association flow

## Task 13: Design System (Linear) — Post-Plan ✅

- [x] 13.1 Przenieść paletę kolorów na CSS custom properties w `globals.css` (Linear: primary #6366f1, dark surfaces, border #24282c, destructive #eb5757)
- [x] 13.2 Przestylować komponenty restauracji (Card, Detail, List, Filters, Form) na Linear-style (subtelne cienie, border-radius 4px, hover states)
- [x] 13.3 Zamienić checkboxy filtrów (kuchnia, dieta, poziom cenowy) na zawijające się chipy — fix nakładających się długich etykiet
- [x] 13.4 Przestylować `NavHeader` na ciemny navbar w stylu Linear
- [x] 13.5 Ujednolicić `OfferFilters` z filtrami restauracji (chipy + Linear style)

## Task 14: Współdzielona lokalizacja użytkownika — Post-Plan ✅

- [x] 14.1 Utrwalić lokalizację w `localStorage` w `useGeolocation` (coordinates + label + source)
- [x] 14.2 Synchronizacja stanu lokalizacji między instancjami hooka i kartami (custom event + storage event)
- [x] 14.3 Stworzyć `LocationIndicator` w nagłówku z możliwością zmiany (GPS / adres / wyczyść)
- [x] 14.4 Dodać fallback `AddressInput` na stronach ofert i restauracji gdy GPS odrzucony

## Task 15: Menu tygodniowe (batch import) — Post-Plan ✅

- [x] 15.1 Rozszerzyć schemę AI o `dayOfWeek` + sekcja WEEKLY MENUS w prompcie
- [x] 15.2 Wymusić język polski dla generowanego tekstu w prompcie AI (fix opis EN / skład PL)
- [x] 15.3 Stworzyć `utils/day-of-week.ts` (`nextDateForDay`, `upcomingDays`, etykiety dni)
- [x] 15.4 Stworzyć `WeeklyMenuPreview` (grupowanie per dzień, wybór dni, publikacja zbiorcza)
- [x] 15.5 Dodać `createOffersBatchAction` (tworzenie wielu ofert w jednej sesji)
- [x] 15.6 Dodać filtr `date` do ofert + selektor dni w `OffersPage`

## Task 16: Korekty layoutu i infrastruktury — Post-Plan ✅

- [x] 16.1 Usunąć zagnieżdżone `<main>` (fix podwójnego scrolla i błędu semantycznego)
- [x] 16.2 Uczynić migracje idempotentnymi (`IF NOT EXISTS`)
- [x] 16.3 Dodać migrację RLS dla `restaurants`
- [x] 16.4 Pominąć `restaurant_id` w insercie oferty gdy brak wartości (kompatybilność wsteczna)
- [x] 16.5 Zwiększyć timeout serwisu AI do 30s

## Task 17: Backlog — kolejne rzeczy do dodania

- [x] 17.1 Strona edycji restauracji `src/app/restaurants/[id]/edit/page.tsx` — formularz pre-filled, wywołanie `updateRestaurant`. RestaurantForm rozszerzony o tryb edycji (`restaurantId` prop + UpdateRestaurantInput).
- [x] 17.2 Strony edycji i usuwania oferty `src/app/offers/[id]/edit/page.tsx` oraz `/delete` — dedykowany formularz edycji (pre-filled, `updateOfferAction`) + ekran potwierdzenia usunięcia (`deleteOfferAction`)
- [x] 17.3 Lista aktywnych ofert na stronie restauracji (Req 6.5) — `getOffersByRestaurant` + sekcja na stronie szczegółów z linkami do ofert
- [ ] 17.4 Reverse geocoding dla lokalizacji GPS — zamienić „Bieżąca lokalizacja" na czytelny adres (np. dzielnica/miasto) w `LocationIndicator`
- [ ] 17.5 Link „Dodaj ofertę" z pre-wybraną restauracją na stronie szczegółów restauracji — przekazać `restaurantId` jako query param do `/add?restaurantId=...` i auto-populate `RestaurantSelect` w formularzu
- [ ] 17.6 Potwierdzenie usunięcia restauracji z informacją o liczbie powiązanych ofert — zastąpić `window.confirm` dedykowanym dialogiem pokazującym liczbę ofert, które zostaną odłączone
- [ ] 17.7 Edycja/usuwanie pojedynczych dań w `WeeklyMenuPreview` przed publikacją — inline edycja nazwy i ceny dania, przycisk usunięcia dania z listy
- [ ] 17.8 Testy property-based/integ. dla nowych funkcji: `nextDateForDay`, batch creation, filtr daty ofert
- [ ] 17.9 Filtr daty również na stronie restauracji (spójność z selektorem dni na ofertach)
- [ ] 17.10 Walidacja/limit liczby ofert w batchu (ochrona przed nadużyciem przy dużych menu)
