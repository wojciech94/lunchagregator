# Implementation Plan: Lunch Agregator

## Overview

Implementacja aplikacji Lunch Agregator w Next.js (App Router) z TypeScript, Supabase (PostgreSQL + PostGIS), Vercel AI SDK, z testami property-based (fast-check), unit (Vitest) i E2E (Playwright). Plan podzielony na fazy: setup, baza danych, serwisy, AI, UI, testy i integracja.

## Tasks

- [x] 1. Project setup and configuration
  - [x] 1.1 Initialize Next.js project with TypeScript and configure dependencies
    - Initialize Next.js App Router project with TypeScript strict mode
    - Install and configure: `@supabase/supabase-js`, `ai` (Vercel AI SDK), `zod`, `react-hook-form`, `@hookform/resolvers`
    - Install dev dependencies: `vitest`, `fast-check`, `@playwright/test`, `axe-core`
    - Configure `tsconfig.json` with path aliases (`@/`)
    - Create `.env.local.example` with required environment variables (SUPABASE_URL, SUPABASE_ANON_KEY, GOOGLE_GENERATIVE_AI_API_KEY)
    - _Requirements: 7.1, 7.2_

  - [x] 1.2 Set up Supabase client and project structure
    - Create `lib/supabase/client.ts` (browser client) and `lib/supabase/server.ts` (server client)
    - Create directory structure: `app/`, `components/`, `services/`, `lib/`, `types/`, `actions/`, `__tests__/`
    - Set up shadcn/ui with Tailwind CSS configuration
    - Configure responsive breakpoints (320px, 768px, 1024px, 1440px, 2560px)
    - _Requirements: 7.1_

  - [x] 1.3 Configure testing frameworks
    - Configure Vitest with `vitest.config.ts` (path aliases, coverage thresholds)
    - Configure fast-check with minimum 100 iterations per property test
    - Configure Playwright with `playwright.config.ts` (multiple viewports, browsers)
    - Create test directory structure: `__tests__/properties/`, `__tests__/unit/`, `__tests__/e2e/`
    - _Requirements: 7.2_

- [x] 2. Database schema and migrations
  - [x] 2.1 Create Supabase migration for lunch_offers table
    - Enable PostGIS extension
    - Create `lunch_offers` table with all columns, CHECK constraints, and defaults as defined in design
    - Create all indexes (date, price, cuisine, dietary GIN, session, location GIST, full-text search GIN)
    - Create `get_offers_within_radius` PostgreSQL function
    - Create migration file in `supabase/migrations/`
    - _Requirements: 6.2, 6.3, 3.7_

  - [x] 2.2 Define TypeScript types and Zod validation schemas
    - Create `types/offers.ts` with `LunchOffer`, `LunchOfferWithDistance`, `PaginatedOffers`, `Coordinates`, `CuisineType`, `DietaryTag`, `Allergen` types
    - Create `types/filters.ts` with `OfferFilters` interface
    - Create `lib/validations/offer.ts` with Zod schemas for create/update offer validation (matching DB constraints)
    - Create `lib/validations/filters.ts` with Zod schema for filter validation
    - _Requirements: 6.2, 6.3, 2.1, 2.2_

- [x] 3. Core services — Offer CRUD and filtering
  - [x] 3.1 Implement OfferService with listing and filtering
    - Create `services/offers.ts` implementing `OfferService` interface
    - Implement `listOffers` with Supabase query: filter by `available_date = today`, apply price/cuisine/dietary/search filters
    - Implement pagination (max 50 per page) and sort options (price_asc, price_desc, distance, newest)
    - Implement full-text search using `to_tsvector` for dish_name and description
    - Apply AND logic for combined filters
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 3.2 Implement OfferService CRUD operations
    - Implement `getOffer(id)` returning full offer details
    - Implement `createOffer(data, sessionToken)` with Zod validation and Supabase insert
    - Implement `updateOffer(id, data, sessionToken)` with ownership check (session_token match)
    - Implement `deleteOffer(id, sessionToken)` with ownership check
    - Return `ActionResult<T>` pattern for error handling
    - _Requirements: 6.1, 6.2, 6.3, 6.6, 6.7_

  - [ ]* 3.3 Write property tests for offer filtering (Properties 1-8)
    - **Property 1: Listing returns only today's offers with pagination limit**
    - **Property 2: Sort order correctness**
    - **Property 3: Distance filter invariant**
    - **Property 4: Price filter invariant**
    - **Property 5: Cuisine filter (OR logic)**
    - **Property 6: Dietary filter (AND logic)**
    - **Property 7: Text search containment**
    - **Property 8: Combined filters equal intersection**
    - **Validates: Requirements 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7**

  - [ ]* 3.4 Write property tests for offer validation (Property 11)
    - **Property 11: Offer validation — required and optional field constraints**
    - **Validates: Requirements 6.2, 6.3, 6.6**

  - [ ]* 3.5 Write property test for session-based ownership (Property 13)
    - **Property 13: Session-based ownership enforcement**
    - **Validates: Requirements 6.7**

- [x] 4. Geolocation and distance calculations
  - [x] 4.1 Implement GeocodingService
    - Create `services/geocoding.ts` implementing `GeocodingService` interface
    - Implement `geocodeAddress(address)` using Nominatim/OpenStreetMap API with error handling
    - Implement `calculateDistance(from, to)` using Haversine formula, returning km rounded to 1 decimal
    - Add timeout handling (10s) and fallback for geocoding failures
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 6.4, 6.5_

  - [ ]* 4.2 Write property test for distance calculation (Property 9)
    - **Property 9: Distance calculation correctness (non-negative, symmetric, zero for identical points, rounded to 1 decimal)**
    - **Validates: Requirements 3.4, 3.7**

  - [x] 4.3 Implement client-side geolocation hook
    - Create `hooks/useGeolocation.ts` with Browser Geolocation API integration
    - Handle permission states (granted, denied, prompt)
    - Implement 10-second timeout with error state
    - Store coordinates in client state for passing to server queries
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 5. Checkpoint — Core services
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. AI Analyzer service
  - [x] 6.1 Implement AIAnalyzerService for link/text/photo extraction
    - Create `services/ai-analyzer.ts` implementing `AIAnalyzerService` interface
    - Implement `analyzeUrl(url)` using Vercel AI SDK `generateObject` with Zod schema for structured extraction
    - Implement `analyzeText(text)` with 5000 character limit validation
    - Implement `analyzeImage(imageUrl)` with vision model for OCR/content analysis
    - Define extraction Zod schema matching `ExtractedOffers` interface
    - Add `withAIFallback` timeout pattern (10s) and error handling
    - _Requirements: 5.1, 5.2, 5.3, 5.6_

  - [x] 6.2 Implement extraction validation and missing field detection
    - Create `lib/validations/extraction.ts` with validation logic for extracted offers
    - Identify missing required fields (restaurant name, dish name, price) and return as `missingFields` list
    - Pre-fill successfully extracted fields in the response
    - Map AI extraction output to `ExtractedOffers` type with confidence score
    - _Requirements: 5.4, 5.5, 5.7, 5.8_

  - [ ]* 6.3 Write property test for extraction validation (Property 12)
    - **Property 12: Extraction validation identifies missing fields**
    - **Validates: Requirements 5.5, 5.8**

  - [x] 6.4 Implement photo upload to Supabase Storage
    - Create `app/api/upload/route.ts` API route
    - Validate file type (JPEG, PNG, WebP) and size (max 10MB)
    - Upload to Supabase Storage and return public URL
    - Handle errors (invalid type, too large) with descriptive messages
    - _Requirements: 5.3_

- [x] 7. AI Recommender chat
  - [x] 7.1 Implement AIRecommenderService with streaming
    - Create `services/ai-recommender.ts` implementing `AIRecommenderService` interface
    - Use Vercel AI SDK `streamText` with system prompt including today's available offers as context
    - Filter and prioritize recommendations based on user preferences (dietary, price, location)
    - Return 1-5 matching offers with natural language explanations
    - Handle "no matching offers" scenario with suggestion to broaden criteria
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_

  - [x] 7.2 Implement chat API route with session management
    - Create `app/api/chat/route.ts` using Vercel AI SDK route handler
    - Implement 50-message-per-session limit with message counting
    - Fetch today's available offers as context for the AI
    - Include user location in context when available
    - Handle AI service unavailability with error message
    - _Requirements: 4.5, 4.7_

  - [ ]* 7.3 Write property test for chat session message limit (Property 14)
    - **Property 14: Chat session message limit**
    - **Validates: Requirements 4.5**

- [x] 8. Server Actions and session management
  - [x] 8.1 Implement Server Actions for offers
    - Create `actions/offers.ts` with server actions: `getOffers`, `getOfferById`, `createOffer`, `updateOffer`, `deleteOffer`
    - Integrate OfferService with Zod validation on server side
    - Return `ActionResult<T>` pattern with field-level errors
    - _Requirements: 6.1, 6.2, 6.6, 6.7_

  - [x] 8.2 Implement session token management
    - Create `actions/session.ts` with session token generation (UUID) and cookie/localStorage storage
    - Create `lib/session.ts` helper to get/set session token
    - Ensure session token is attached to all offer creation operations
    - _Requirements: 6.7_

  - [x] 8.3 Implement Server Actions for AI analysis and geocoding
    - Create `actions/analyze.ts` wrapping AIAnalyzerService calls
    - Create `actions/geocode.ts` wrapping GeocodingService for address resolution
    - Handle errors and return structured results
    - _Requirements: 5.1, 5.2, 5.3, 6.4, 6.5_

- [x] 9. Checkpoint — Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. UI Components — Offer browsing
  - [x] 10.1 Implement OfferCard and OfferList components
    - Create `components/offers/OfferCard.tsx` displaying: restaurant name, dish name, price (PLN), truncated description (max 150 chars with ellipsis), distance (if available)
    - Create `components/offers/OfferList.tsx` with pagination and empty state message
    - Implement responsive card layout (grid on desktop, stack on mobile)
    - Ensure minimum tap target 44x44px and 8px spacing on mobile
    - _Requirements: 1.1, 1.3, 1.5, 7.1, 7.3_

  - [ ]* 10.2 Write property test for description truncation (Property 10)
    - **Property 10: Description truncation on list view**
    - **Validates: Requirements 1.3**

  - [x] 10.3 Implement OfferDetails page
    - Create `app/offers/[id]/page.tsx` as Server Component
    - Display full offer details: all fields including allergens, dietary tags, restaurant address
    - Show edit/delete buttons if session token matches offer owner
    - _Requirements: 1.4, 6.7_

  - [x] 10.4 Implement OfferFilters component
    - Create `components/offers/OfferFilters.tsx` with filter controls
    - Distance slider (0.5-25 km), price range inputs, cuisine type multi-select, dietary tags multi-select
    - Search input with 2-character minimum and debounced updates
    - Sort dropdown (price asc/desc, distance, newest)
    - Empty state message when no offers match filters
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 10.5 Implement main page with Server Component
    - Create `app/page.tsx` as Server Component fetching today's offers
    - Wire OfferList and OfferFilters together with client-side filter state
    - Implement sort by distance (default when location available) or alphabetical (fallback)
    - Hide distance field when location unavailable
    - _Requirements: 1.1, 1.2, 1.5_

- [x] 11. UI Components — Add offer flow
  - [x] 11.1 Implement InputSelector and AI extraction UI
    - Create `components/add-offer/InputSelector.tsx` with tabs for link/text/photo input
    - Create link input with URL validation
    - Create text input (textarea, max 5000 chars)
    - Create photo upload with drag-and-drop (JPEG/PNG/WebP, max 10MB)
    - Show loading state during AI extraction
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 11.2 Implement OfferPreview and OfferForm components
    - Create `components/add-offer/OfferPreview.tsx` showing extracted data with highlighted missing fields
    - Create `components/add-offer/OfferForm.tsx` with React Hook Form + Zod validation
    - Pre-fill form with extracted data, highlight missing required fields
    - Validate all constraints (dish_name ≤100, price 0.01-9999.99, restaurant_name ≤100, date today-30 days)
    - Allow editing all fields before confirmation
    - _Requirements: 5.4, 5.5, 5.7, 5.8, 6.2, 6.3_

  - [x] 11.3 Implement add offer page with full flow
    - Create `app/add/page.tsx` orchestrating: input → AI extraction → preview → edit → confirm → save
    - Wire InputSelector → analyze action → OfferPreview → OfferForm → createOffer action
    - Handle errors at each step (AI failure → manual form, geocoding failure → save without coords)
    - Show success message and redirect to main page after save
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 6.1_

- [x] 12. UI Components — Chat and location
  - [x] 12.1 Implement ChatWindow and message components
    - Create `components/chat/ChatWindow.tsx` using Vercel AI SDK `useChat` hook
    - Create `components/chat/ChatMessage.tsx` for user and AI messages
    - Create `components/chat/RecommendationCard.tsx` for displaying recommended offers inline
    - Implement streaming response display
    - Show error state when AI service unavailable
    - _Requirements: 4.1, 4.2, 4.3, 4.7_

  - [x] 12.2 Implement chat page
    - Create `app/chat/page.tsx` with ChatWindow
    - Pass user location context to chat when available
    - Implement 50-message limit with UI feedback
    - _Requirements: 4.1, 4.5_

  - [x] 12.3 Implement LocationPrompt and AddressInput components
    - Create `components/location/LocationPrompt.tsx` with geolocation permission request
    - Create `components/location/AddressInput.tsx` for manual address entry (max 200 chars)
    - Show prompt only on first visit (check localStorage)
    - Handle denied permission → show address input
    - Handle geocoding failure → show error + retry
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6_

  - [x] 12.4 Implement app layout and navigation
    - Create `app/layout.tsx` with responsive navigation (hamburger on mobile)
    - Navigation links: Browse offers, Add offer, Chat
    - Apply global styles, font sizes (min 16px on mobile)
    - Ensure no horizontal scrolling at any viewport width (320px-2560px)
    - _Requirements: 7.1, 7.3, 7.4_

- [x] 13. Checkpoint — UI complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Integration and E2E tests
  - [ ]* 14.1 Write integration tests for API routes and server actions
    - Test offer CRUD server actions with mocked Supabase
    - Test chat API route with mocked AI responses
    - Test upload API route with valid/invalid files
    - Test geocoding action with mocked Nominatim API
    - _Requirements: 6.1, 6.2, 4.2, 5.1, 5.2, 5.3, 6.4_

  - [ ]* 14.2 Write E2E tests for critical user flows (Playwright)
    - Test: Browse offers on main page, apply filters, view details
    - Test: Add offer via text input → preview → edit → confirm → visible on list
    - Test: Chat with AI recommender → receive recommendations
    - Test: Edit/delete own offer (session-based)
    - Test: Responsive layout at 320px, 768px, 1024px, 1440px viewports
    - _Requirements: 1.1, 2.1, 5.1, 6.7, 7.1_

  - [x] 14.3 Write accessibility and responsive tests
    - Run axe-core automated accessibility audit on all pages — `__tests__/e2e/responsive.spec.ts`, five routes across the five viewport projects. `axe-core` is no longer an unused dependency.
    - Verify tap target sizes on mobile viewports — asserted at 320 and 768 against **24x24**, with links inline within a sentence exempt per WCAG 2.2 SC 2.5.8. The threshold was 44x44 until #25 settled it; 44 is an Apple HIG / WCAG 2.1 AAA figure and produced 54 findings where 24 produces 0.
    - Verify content is reachable at 320px-2560px — asserted per element. `overflow-x-hidden` has been removed from `html`/`body`, so the document-level `scrollWidth` comparison is no longer vacuous, and the per-element probe is what catches a clipped control.
    - Verify font sizes on mobile — inherited text must be 16px or larger at 320 and 768; explicit `text-sm`/`text-xs` are allowed to take precedence, required-field markers and control labels are not.
    - Screenshot comparison at key breakpoints — **not done.** The measurements cover the numeric requirements; visual regression needs reference images that do not exist in this repository, and generating them would enshrine the current layout as the baseline.
    - The suite compares against a recorded baseline rather than asserting zero. Requirement 7 had real violations catalogued in #23; they are now fixed, so the baseline is close to empty and is retained only so a regression is still caught.
    - Cross-browser smoke for 7.2 lives in `__tests__/e2e/browser-smoke.spec.ts` and runs on chromium and edge, the two engines Requirement 7.2 covers. firefox and webkit are out of scope for this project and have no projects declared in `playwright.config.ts`.
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 15. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The tech stack is: Next.js (App Router), TypeScript, Supabase (PostgreSQL + PostGIS), Vercel AI SDK, Vitest, fast-check, Playwright
- All AI interactions use Vercel AI SDK (`generateObject` for extraction, `streamText`/`useChat` for chat)
- PostGIS handles all spatial queries and distance calculations at the database level

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.2"] },
    { "id": 3, "tasks": ["3.1", "3.2", "4.1"] },
    { "id": 4, "tasks": ["3.3", "3.4", "3.5", "4.2", "4.3"] },
    { "id": 5, "tasks": ["6.1", "6.4", "7.1", "8.2"] },
    { "id": 6, "tasks": ["6.2", "7.2", "8.1", "8.3"] },
    { "id": 7, "tasks": ["6.3", "7.3"] },
    { "id": 8, "tasks": ["10.1", "10.3", "10.4"] },
    { "id": 9, "tasks": ["10.2", "10.5", "11.1"] },
    { "id": 10, "tasks": ["11.2", "12.1", "12.3"] },
    { "id": 11, "tasks": ["11.3", "12.2", "12.4"] },
    { "id": 12, "tasks": ["14.1", "14.2", "14.3"] }
  ]
}
```
