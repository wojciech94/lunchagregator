# Requirements Document

## Introduction

Funkcjonalność autentykacji użytkowników w aplikacji Lunch Agregator zastępuje obecny mechanizm anonimowej identyfikacji oparty na `session_token` (UUID w cookie/localStorage) pełnoprawnymi kontami użytkowników zarządzanymi przez Supabase Auth. Właściciele restauracji rejestrują się i logują, a ich restauracje oraz oferty lunchowe są powiązane z kontem (`user_id`) zamiast z tokenem sesji. Przeglądanie ofert i restauracji pozostaje publiczne — bez wymogu logowania. Istniejące dane (restauracje i oferty powiązane z `session_token`) są migrowane do kont użytkowników.

## Glossary

- **System**: Aplikacja webowa Lunch Agregator (Next.js App Router + Supabase)
- **Auth_Service**: Moduł Supabase Auth odpowiedzialny za rejestrację, logowanie, wylogowanie i zarządzanie sesją JWT
- **User**: Zarejestrowany właściciel restauracji posiadający konto w systemie (identyfikowany przez `user_id`)
- **Guest**: Niezalogowany odwiedzający, który może przeglądać restauracje i oferty, ale nie może nimi zarządzać
- **Session**: Aktywna sesja uwierzytelnionego użytkownika zarządzana przez Supabase Auth (token JWT w cookie HttpOnly)
- **Restaurant**: Encja restauracji powiązana z `user_id` właściciela
- **Lunch_Offer**: Oferta lunchowa powiązana z `user_id` właściciela
- **Protected_Route**: Trasa Next.js dostępna wyłącznie dla zalogowanych użytkowników (np. dodawanie/edycja/usuwanie restauracji i ofert)
- **Public_Route**: Trasa Next.js dostępna dla wszystkich odwiedzających bez logowania (np. przeglądanie restauracji i ofert)
- **Migration**: Jednorazowy proces przypisania istniejących rekordów powiązanych z `session_token` do konta użytkownika po jego rejestracji lub logowaniu
- **Middleware**: Moduł Next.js Middleware weryfikujący sesję i przekierowujący nieautoryzowane żądania

## Requirements

### Requirement 1: Rejestracja użytkownika

**User Story:** Jako właściciel restauracji chcę zarejestrować konto w aplikacji, aby móc zarządzać swoimi restauracjami i ofertami w sposób trwały i bezpieczny.

#### Acceptance Criteria

1. WHEN użytkownik przesyła formularz rejestracji z adresem e-mail i hasłem, THE Auth_Service SHALL utworzyć nowe konto użytkownika i zwrócić potwierdzenie w ciągu 5 sekund
2. THE System SHALL wymagać, aby adres e-mail był w formacie zgodnym ze standardem RFC 5322 (zawierał znak `@` i domenę)
3. THE System SHALL wymagać, aby hasło miało co najmniej 8 znaków
4. IF użytkownik poda adres e-mail już zarejestrowany w systemie, THEN THE Auth_Service SHALL odrzucić rejestrację i wyświetlić komunikat „Konto z tym adresem e-mail już istnieje" — odrzucenie i wyświetlenie komunikatu muszą nastąpić łącznie
5. IF użytkownik poda nieprawidłowy adres e-mail lub hasło niespełniające wymagań, THEN THE System SHALL odrzucić formularz, podświetlić nieprawidłowe pola i wyświetlić szczegółowy komunikat wskazujący wymaganą korektę dla każdego pola z osobna
6. WHEN rejestracja zakończy się sukcesem, THE System SHALL automatycznie zalogować użytkownika i przekierować go na stronę główną (`/`)
7. THE System SHALL wyświetlać formularz rejestracji na dedykowanej trasie `/auth/register`
8. IF Auth_Service zwróci błąd inny niż duplikat e-mail lub błąd walidacji, THEN THE System SHALL wyświetlić komunikat „Wystąpił błąd podczas rejestracji. Spróbuj ponownie." bez ujawniania szczegółów technicznych

### Requirement 2: Logowanie użytkownika

**User Story:** Jako zarejestrowany właściciel restauracji chcę zalogować się na swoje konto, aby uzyskać dostęp do zarządzania restauracjami i ofertami.

#### Acceptance Criteria

1. WHEN użytkownik przesyła formularz logowania z prawidłowym adresem e-mail i hasłem, THE Auth_Service SHALL uwierzytelnić użytkownika i ustanowić Session w ciągu 5 sekund; IF Auth_Service nie odpowie w ciągu 5 sekund, THEN THE System SHALL wyświetlić komunikat o przekroczeniu limitu czasu i umożliwić ponowną próbę
2. WHEN logowanie zakończy się sukcesem, THE System SHALL przekierować użytkownika na ścieżkę wskazaną przez parametr `redirectTo` (wyłącznie wewnętrzne Protected_Route), lub na stronę główną (`/`) jeśli parametr jest nieobecny lub wskazuje na zewnętrzny URL
3. IF użytkownik poda nieprawidłowy adres e-mail lub hasło, THEN THE Auth_Service SHALL odrzucić próbę logowania i wyświetlić komunikat „Nieprawidłowy adres e-mail lub hasło" bez ujawniania, które pole jest błędne
4. THE System SHALL wyświetlać formularz logowania na dedykowanej trasie `/auth/login`
5. THE System SHALL przechowywać Session jako token JWT w cookie HttpOnly, niedostępnym dla JavaScript po stronie klienta
6. WHILE użytkownik posiada aktywną Session z czasem wygaśnięcia ≤ 60 sekund, THE System SHALL automatycznie odświeżać token JWT bez wymagania ponownego logowania; IF mechanizm odświeżania tokenu zakończy się niepowodzeniem, THEN THE System SHALL wylogować użytkownika zgodnie z procedurą opisaną w Requirement 3

### Requirement 3: Wylogowanie użytkownika

**User Story:** Jako zalogowany użytkownik chcę wylogować się z konta, aby zakończyć sesję i zabezpieczyć swoje dane.

#### Acceptance Criteria

1. WHEN użytkownik inicjuje wylogowanie, THE Auth_Service SHALL unieważnić aktywną Session i usunąć cookie sesji — obie operacje muszą zakończyć się w ciągu 3 sekund; IF którakolwiek z operacji zakończy się niepowodzeniem, THEN THE System SHALL wyświetlić komunikat o błędzie wylogowania i pozostawić użytkownika na bieżącej stronie
2. WHEN wylogowanie zakończy się sukcesem, THE System SHALL przekierować użytkownika na stronę główną (`/`)
3. WHEN wylogowanie zakończy się sukcesem, THE System SHALL wyświetlać interfejs dla niezalogowanego użytkownika (przyciski „Zaloguj się" i „Zarejestruj się" zamiast menu użytkownika)
4. WHILE Session użytkownika jest wygasła lub nieważna, THE System SHALL traktować użytkownika jako Guest
5. WHEN Guest próbuje uzyskać dostęp do Protected_Route (z wygasłą lub nieważną Session), THE System SHALL przekierować go na `/auth/login` z parametrem `redirectTo` wskazującym oryginalną ścieżkę

### Requirement 4: Ochrona tras zarządzania

**User Story:** Jako właściciel restauracji chcę mieć pewność, że tylko zalogowani użytkownicy mogą dodawać, edytować i usuwać restauracje oraz oferty, aby dane były bezpieczne.

#### Acceptance Criteria

1. WHEN Guest próbuje uzyskać dostęp do Protected_Route, THE Middleware SHALL przekierować go na `/auth/login` z parametrem `redirectTo` zawierającym oryginalną ścieżkę żądania (np. `redirectTo=/restaurants/new`)
2. THE System SHALL traktować jako Protected_Route następujące trasy: `/restaurants/new`, `/restaurants/[id]/edit`, `/offers/[id]/edit`, `/offers/[id]/delete`, `/add`
3. WHEN zalogowany User uzyskuje dostęp do Protected_Route, THE Middleware SHALL przepuścić żądanie bez przekierowania
4. THE System SHALL weryfikować Session po stronie serwera w Middleware wyłącznie dla żądań kierowanych do Protected_Route — żądania do Public_Route nie są weryfikowane przez Middleware
5. IF Server Action modyfikująca dane (tworzenie, edycja, usuwanie restauracji lub oferty) zostanie wywołana bez aktywnej Session, THEN THE System SHALL odrzucić operację, zwrócić komunikat błędu wskazujący na brak autoryzacji i nie modyfikować żadnych danych w bazie

### Requirement 5: Powiązanie danych z kontem użytkownika

**User Story:** Jako zalogowany właściciel restauracji chcę, aby moje restauracje i oferty były powiązane z moim kontem, a nie z tokenem sesji, aby nie utracić dostępu do nich po zmianie urządzenia lub przeglądarki.

#### Acceptance Criteria

1. WHEN zalogowany User tworzy nową Restaurant, THE System SHALL zapisać `user_id` użytkownika jako właściciela restauracji w kolumnie `user_id` tabeli `restaurants`
2. WHEN zalogowany User tworzy nową Lunch_Offer, THE System SHALL zapisać `user_id` użytkownika jako właściciela oferty w kolumnie `user_id` tabeli `lunch_offers`
3. WHEN zalogowany User inicjuje operację edycji lub usunięcia zasobu, THE System SHALL porównać `user_id` z aktywnej Session z `user_id` zapisanym w rekordzie; IF porównanie nie może zostać ukończone z powodu błędu systemowego, THEN THE System SHALL odrzucić operację i zachować dane bez zmian
4. IF zalogowany User próbuje edytować lub usunąć Restaurant lub Lunch_Offer należącą do innego użytkownika, THEN THE System SHALL odrzucić operację, zwrócić komunikat „Brak uprawnień do tej operacji" i nie modyfikować danych
5. IF Restaurant lub Lunch_Offer ma `user_id` równe NULL (zasób niezmigrowany), THEN THE System SHALL traktować go jako nienależący do żadnego użytkownika i odrzucić operacje edycji i usunięcia dla wszystkich zalogowanych użytkowników
6. THE System SHALL wyświetlać przyciski edycji i usuwania wyłącznie dla zasobów, których `user_id` odpowiada `user_id` aktualnie zalogowanego użytkownika; WHILE użytkownik jest Guestem, THE System SHALL nie wyświetlać przycisków edycji i usuwania dla żadnego zasobu

### Requirement 6: Migracja danych z session_token na user_id

**User Story:** Jako właściciel restauracji, który wcześniej korzystał z aplikacji anonimowo, chcę przypisać swoje istniejące restauracje i oferty do nowego konta, aby nie utracić dotychczasowych danych.

#### Acceptance Criteria

1. WHEN User rejestruje nowe konto lub loguje się na istniejące, THE System SHALL sprawdzić, czy w przeglądarce użytkownika istnieje cookie `session_token` z niepustą wartością
2. WHEN aktywny `session_token` zostanie wykryty po zalogowaniu, THE System SHALL w ramach jednej transakcji bazodanowej przypisać wszystkie Restaurant i Lunch_Offer powiązane z tym `session_token` (gdzie `user_id IS NULL`) do `user_id` zalogowanego użytkownika
3. WHEN migracja zakończy się sukcesem, THE System SHALL usunąć cookie `session_token` z przeglądarki użytkownika
4. IF podczas migracji wystąpi błąd bazy danych, THEN THE System SHALL wycofać transakcję (rollback), zachować wszystkie dane bez zmian, zalogować błąd po stronie serwera i wyświetlić użytkownikowi komunikat „Nie udało się przypisać wcześniejszych danych do konta. Skontaktuj się z pomocą techniczną." — błąd migracji nie przerywa procesu logowania
5. THE System SHALL migrować wyłącznie rekordy Restaurant i Lunch_Offer, których kolumna `user_id` jest NULL; rekordy z istniejącym `user_id` nie są modyfikowane
6. WHEN Restaurant lub Lunch_Offer zostanie zmigrowana, THE System SHALL zmienić wyłącznie kolumnę `user_id` — wszystkie pozostałe pola rekordu pozostają niezmienione

### Requirement 7: Nawigacja i stan interfejsu użytkownika

**User Story:** Jako użytkownik aplikacji chcę widzieć w nawigacji aktualny stan zalogowania, aby wiedzieć, czy jestem zalogowany i mieć szybki dostęp do akcji konta.

#### Acceptance Criteria

1. WHILE User posiada aktywną Session, THE System SHALL wyświetlać w NavHeader adres e-mail zalogowanego użytkownika oraz przycisk „Wyloguj się"
2. WHILE użytkownik jest Guestem (brak aktywnej Session), THE System SHALL wyświetlać w NavHeader przyciski „Zaloguj się" i „Zarejestruj się"
3. WHEN stan Session zmieni się (logowanie lub wylogowanie), THE System SHALL zaktualizować interfejs NavHeader w ciągu 1 sekundy bez przeładowania całej strony
4. THE System SHALL renderować NavHeader po stronie serwera (SSR) z tym samym stanem, który zostanie wyrenderowany po stronie klienta (hydration) — zawartość NavHeader nie może się zmienić między SSR a hydration
5. WHILE stan Session jest nieokreślony podczas hydration (np. oczekiwanie na weryfikację tokenu), THE System SHALL wyświetlać NavHeader w stanie Guest do momentu potwierdzenia aktywnej Session

### Requirement 8: Bezpieczeństwo sesji

**User Story:** Jako użytkownik aplikacji chcę mieć pewność, że moja sesja jest bezpieczna i odporna na typowe ataki webowe.

#### Acceptance Criteria

1. THE System SHALL przechowywać token JWT sesji wyłącznie w cookie z flagami `HttpOnly`, `Secure` i `SameSite=Lax`
2. THE Auth_Service SHALL automatycznie unieważniać Session po 7 dniach nieaktywności użytkownika
3. IF ten sam adres e-mail zostanie użyty do 5 nieudanych prób logowania w ciągu 15 minut, THEN THE Auth_Service SHALL zablokować kolejne próby logowania dla tego adresu na 15 minut i wyświetlić komunikat „Zbyt wiele nieudanych prób. Spróbuj ponownie za 15 minut."
4. THE System SHALL stosować walidację danych wejściowych po stronie serwera (Zod) dla wszystkich pól formularzy autentykacji przed przekazaniem ich do Auth_Service; IF walidacja nie powiedzie się, THEN THE System SHALL odrzucić żądanie bez wywołania Auth_Service
5. THE System SHALL używać połączenia HTTPS dla wszystkich żądań zawierających dane uwierzytelniające; żądania HTTP do tras autentykacji SHALL być przekierowywane na HTTPS
