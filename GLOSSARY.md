# GLOSSARY

Słownik domeny lunch-aggregatora. Format i konsumpcja: `docs/agents/domain.md`. Nazwy terminów trzymają się kodu i specyfikacji; definicje po polsku, tak jak w specach. Zmiana znaczenia terminu = zmiana w tym pliku **i** w speca, nie osobna prawda.

## Osoby i uprawnienia

- **User** — zalogowane konto. Może przeglądać, filtrować, dodawać oferty, zarządzać własnymi, wznowić menu swojej restauracji. Własność ofert i restauracji: `user_id`, chroniona dwuwarstwowo (RLS `auth.uid() = user_id` + `getUser()`/`checkOwnership()` w akcjach).
- **Visitor** — osoba bez konta. Przegląda, filtruje, korzysta z geolokalizacji i rekomendacji AI; nie dodaje ani nie zarządza ofertami. Rozróżnienie User/Visitor wycofało anonimowe dodawanie (lunch-aggregator, Introduction).
- **Admin** — konto z rolą w `app_metadata.role`, czytaną przez `is_admin()` w RLS. Edytuje i usuwa dowolny rekord, działa przez panel (`/admin`) z append-only audit logiem. Nie używa stron użytkownika do zadań administracyjnych.

## Oferty i restauracje

- **Lunch_Offer** — pojedyncza oferta lunchowa: danie, cena, opis, snapshot restauracji, `available_date` (pojedyncza data, dziś..30 dni w przód; trigger waliduje na `INSERT`).
- **Restaurant** — encja restauracji z metadanymi (adres, `location` GEOGRAPHY, poziom cenowy, godziny lunchowe, kuchnia). Semantyka powiązania oferta↔restauracja należy do spec `restaurant-management`.
- **Snapshot** — pola restauracji zduplikowane na ofercie (nazwa, adres, lokalizacja) w chwili publikacji. **Źródło prawdy dla wyświetlania** — zmiana w `restaurants` nie przepisuje opublikowanych ofert; inwariant Req 6.2. `restaurant_id` jest opcjonalne i służy śledzeniu, nie wyświetlaniu.
- **Orphan Offer** — oferta bez właściciela (`user_id IS NULL`). Odzyskuje ją admin w panelu (`get_orphan_offers`, #55). **Nie** nazywamy tak oferty bez `restaurant_id` — ta to zwykła oferta ze snapshotem, tylko niepowiązana.

## Ekstrakcja i menu

- **Extraction** — analiza AI (Vercel AI SDK, Google) wklejonego linku, tekstu lub zdjęcia → ustrukturyzowane oferty. Dla każdego dania może rozpoznać `dayOfWeek` (kanoniczne `monday`..`sunday`).
- **Weekly Menu** — menu rozłożone na dni tygodnia, publikowane batchem (`createOffersBatchAction`); każdy dzień dostaje `nextDateForDay(dzień)` — najbliższe wystąpienie włącznie z dzisiejszym dniem.
- **Restaurant-first** — zasada z #68: publikowana oferta musi mieć przypisaną restaurację. Po ekstrakcji deterministyczny match (`ilike` + preferencja dokładnego trafienia znormalizowanej nazwy); brak/niejednoznaczność → obowiązkowy krok „przypisz lub utwórz" przed otwarciem formularza oferty.

## Pętla świeżości

- **Offer Group** — w „Moje oferty": oferty użytkownika jednej restauracji (klucz `restaurant_id`). Oferty bez `restaurant_id` lądują w odrębnej grupie „bez restauracji" — martwe, bez doczepiania post-hoc (decyzja #18).
- **Re-publication (Wznowienie)** — jednoczesne utworzenie nowych ofert z bieżącego menu restauracji: okno `[dziś−7, dziś+6]` na własnych ofertach, mapowanie **`data + 7 dni`**, dania verbatim z oferty źródłowej, adres i współrzędne z bieżącej restauracji, **zero geokodowania**, duplikaty pomijane z raportem (per użytkownik: `restaurant_id` + `dish_name` + data docelowa).
- **Weekly Menu Flag** (`restaurants.menu_recurs_weekly`) — znacznik „menu powtarza się co tygodnie, do odwołania". Marker intencji i surfacingu („Menu tygodniowe do odnowienia" na górze „Moje oferty"); **nie jest wyzwalaczem automatyzacji** — nic nie publikuje się samo.

## Decyzje i ich ślad

Każde ustalenie powyżej ma swoje źródło: numer issues na GitHubie (`wojciech94/lunchagregator`) lub nagłówek w migracji. Tam idzie pytanie „dlaczego tak", nie do tego pliku.
