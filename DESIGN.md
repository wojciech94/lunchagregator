# Lunch Aggregator UI direction

Status: approved direction with the browse foundation implemented, 2026-10-10. The application now uses these tokens, shared controls, navigation styling and browse interactions. The [interactive prototype](docs/design/lunch-ui.html) remains a standalone design specimen with fictional offers and local state, without APIs, authentication or database writes. Open that file directly in a browser. Polish is the product language; repository design documentation is English.

## Product intent

Help someone answer “What can I eat nearby on this date, within my budget?” in one scan. Use a warm paper background and forest-green actions in light mode; dark mode uses an espresso canvas, cream text and terracotta actions. Keep strong dish titles and aligned prices. Content must work without photography: the offer model has no image field. Avoid ratings, walking times, stock counts, “open now” or verified-source labels without supporting data.

The existing application uses Next.js App Router, Tailwind v4, shadcn New York with Radix, and Lucide. Keep that foundation. Preserve offer snapshots, URL filters and navigation history, location fallback, pagination, ownership checks and RLS.

## Foundations

These values are mapped to existing variables in `src/app/globals.css`. The standalone prototype retains the original palette as a historical specimen; production dark mode now uses the espresso/terracotta palette below.

The root declares `color-scheme: light`, and `.dark` declares `color-scheme: dark`, so native date/time indicators, picker UI and scrollbars follow the selected application theme. This follows the theme class and cookie rather than the operating system preference.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| background | `#F7F6F2` | `#1C1917` | Warm canvas |
| foreground / card-foreground | `#202C25` | `#FAF3EB` | Titles and body |
| card / popover | `#FFFFFF` | `#27221E` | Reading surfaces |
| primary | `#245C3D` | `#EDB08C` | Main action, selected day |
| primary-foreground | `#FFFFFF` | `#301E14` | Text on primary |
| muted / secondary / accent | `#EDEFE8` | `#36302A` | Quiet surfaces |
| muted-foreground | `#59665D` | `#C7B9AB` | Supporting text |
| border | `#D9DED6` | `#5A4D42` | Decorative separation |
| input | `#839287` | `#A18B78` | Control outlines |
| ring | `#245C3D` | `#EDB08C` | Keyboard focus |
| destructive | `#A52B26` | `#FFA8A1` | Errors and destructive actions |
| destructive-foreground | `#FFFFFF` | `#361511` | Text on destructive |
| warning | `#FFF3DD` | `#36291C` | Warning surface |
| warning-foreground | `#8A4B0D` | `#F0C184` | Warning text/icons |
| warning-border | `#A87832` | `#9F7840` | Warning boundaries and suggested-field ring |
| success | `#245C3D` | `#B9DEC1` | Success text/icons |
| overlay | `#000000` | `#000000` | Modal backdrop, used at 50% opacity |

Use semantic tokens throughout components. Input outlines are stronger than decorative card borders. Never reduce text contrast with opacity. Check rendered contrast before production: at least 4.5:1 for normal text, 3:1 for large text and control boundaries/focus indicators. The prototype logs computed token-pair ratios for both themes; this is not a complete accessibility audit.

Contribution and save actions use the shared Button variants, including Add restaurant, restaurant-detail Add offer, the My offers empty-state action and Save changes. Their hover follows `primary` in both themes; do not restore legacy per-screen blue hover colors.

Status colors use `warning`, `warning-foreground`, `warning-border` and `success`; keep status text/icons so meaning does not rely on color. Price-level metadata uses neutral outline Badge variants and explicit labels. Active contribution navigation and open/active account controls are styled by Button variants via `aria-current`, `data-state` and `data-active`, not local color overrides. Shared Checkbox, Textarea, Tabs, Badge and Slider use the same semantic palette for both themes. See the [source color audit](docs/design/color-audit.md) for scope and verification limits.

Keep Inter (already configured) for production. Prototype uses a system sans stack to run offline. Typography: page title 36/40 desktop, 28/32 mobile; section 24/30; dish 20/26; body 16/24; metadata 14/20; small label 12/18. Use weight 600 for titles, 700 for price, tabular numerals for prices. No all-caps form labels; small uppercase eyebrow labels are decorative context only.

Spacing scale: 4, 8, 12, 16, 24, 32, 48px. Cards have 24px padding (20px on mobile), 16px radius, 1px borders, no default shadow. Controls have 8px radius and minimum 44px touch targets. All Button variants reserve a 1px border and own their text color; outline actions use the input border token. Default, small and extra-small buttons are 44px tall; large buttons are 48px. Small sizes reduce padding rather than the touch target. Admin restaurant edit links and the restaurant date-menu submit action use the shared Button, and the date field uses Input. Badges use a full radius. Use `flex`/`grid` with `gap`, and `cn()` for conditional classes. Reserve shadows for overlays. Motion: 120–180ms color/opacity only; honor reduced motion.

## Browse screen recipe

1. Header: product name, Oferty, Restauracje, Czat AI, and account/contribution actions appropriate to auth state. Desktop actions follow this order: add offer, theme toggle, account controls. The theme toggle remains visible on mobile; add offer stays in the mobile menu. Do not expose administrator actions in the public browsing navigation. Mobile menu retains every destination.
2. Compact introduction: “Dobry lunch. Blisko Ciebie.” Location appears next to this task context, with explicit change and manual-address entry. Request geolocation only on an intentional action.
3. Seven-day single selection plus a next-week action. All dates wrap visibly at narrow widths. Use Polish weekday labels and Europe/Warsaw menu dates from existing helpers, not UTC date slicing. Selecting next week replaces the date window and selects its Monday.
4. Search, filter control with an active count, and sort. Selected criteria remain visible as removable chips. Production requires the full existing price min/max, eight cuisines, five dietary tags and distance radius; the prototype intentionally demonstrates a subset. Search retains the existing minimum-two-character and debounce contract.
5. Result count with full selected date and truthful sorting label. Default order remains distance when location exists, otherwise restaurant name. No unsupported “recommended” sort.
6. Equal-weight offer cards: cuisine; dish title; full formatted price; restaurant snapshot; description; items; diet tags; distance when available; one “Zobacz ofertę” action. Never invent zero distance for unknown coordinates. No nested interactive controls inside a linked card.
7. Detail: full dish/price/date, snapshot restaurant/address, description/items/diet/allergen data, then restaurant link when associated. Missing allergens mean unknown, not allergen-free. Lunch hours may come from associated restaurant metadata and must be labelled as restaurant hours. Expired or withdrawn records must not look available.

## Other screens

- Restaurants: same header, location, search/filter recipe and quiet cards; show address and cuisine before secondary metadata. Offers and restaurants share FilterToolbar and FilterPanel: search with an icon, a counted filter trigger, removable applied criteria, and a bottom sheet on mobile / side panel on desktop. Restaurant choices are drafts until “Pokaż restauracje”; Cancel, Escape, close and backdrop dismissal discard them. Use the same Field/Checkbox cuisine layout and outline ToggleGroup for price levels. Preserve restaurant-specific distance, price level, cuisine and lunch-time criteria. Only explicitly chosen distance limits are applied; showing a default 10 km slider does not silently add a radius. Restaurant filters remain local page state with debounced search (300 ms, minimum two characters); URL/history persistence belongs to offers. Detail introduces restaurant information, then date-specific offers.
- Czat AI: short suggested prompts, clear sending/error states and recommendation cards with concrete prices, dates and distances. Recommendation actions lead to actual offers. Keep a visible explanation that results come from available offers; do not promise dietary safety.
- Add offer: restaurant assignment, extraction input, editable review, then publication. Preserve restaurant-first rules. Extraction suggestions remain editable and distinct from submitted data. Show success counts and recoverable partial failures.
- Moje menu / Moje oferty: compact management rows, restaurant grouping, date/status, edit action and overflow actions. Generated offers lead to their menu for editing. Show recurring schedule, effective revision date and exceptions explicitly; never infer recurrence from a visual badge alone.
- Admin: same tokens and controls, denser tables and explicit audit context. Server permissions remain authoritative.

## Components and implementation

| Recipe | Existing/recommended shadcn composition |
| --- | --- |
| Main and secondary actions | Existing Button variants; change shared `cva` sizes/styles centrally |
| Offer | Existing CardHeader, CardTitle, CardDescription, CardContent, CardFooter; Button `asChild` for Next Link |
| Diet metadata | Existing Badge secondary/outline variants; labels remain readable |
| Date choices | ToggleGroup with single selection; reject empty value so a date stays selected |
| Search | InputGroup + InputGroupInput + InputGroupAddon; visible or screen-reader label |
| Filter panel | Existing Sheet with SheetTitle, description, FieldGroup + Field; draft/apply/cancel semantics |
| Diet controls | ToggleGroup multiple; use FieldSet/FieldLegend for related checkboxes |
| Sort | Existing Select with SelectGroup containing SelectItem |
| Location | Existing Dialog with DialogTitle; retain AddressInput and permission fallback |
| No results / failure / loading | Empty / Alert / existing Skeleton / Spinner; stable results region with aria-busy |

The listed primitives are installed and use the existing `@/lib/utils` helper. Dependencies and the New York/Radix foundation are preserved. No preset switch or bulk component overwrite is necessary. Do not use per-screen `className` overrides for component colors/typography; change tokens and variants. Keep Lucide icons with `data-icon` in buttons and an accessible label for icon-only actions.

Reference APIs checked via the shadcn CLI: [Button](https://ui.shadcn.com/docs/components/radix/button), [Card](https://ui.shadcn.com/docs/components/radix/card), [ToggleGroup](https://ui.shadcn.com/docs/components/radix/toggle-group), [Sheet](https://ui.shadcn.com/docs/components/radix/sheet), [Select](https://ui.shadcn.com/docs/components/radix/select), [Badge](https://ui.shadcn.com/docs/components/radix/badge). The standalone HTML uses native controls to demonstrate behavior; production must use repository React components.

## Responsive and interaction rules

Maximum content width 1200px, page gutters 16px mobile / 32px desktop. One card column below 640px, two from 640px, three from 1024px. These are explicit layout thresholds: the repository's `sm` breakpoint is 320px, so do not assume Tailwind defaults. At 320px, dates wrap, actions stack, price/title remain readable, and no page-level horizontal scroll appears. At 200% zoom the same reflow applies.

Mobile filter Sheet opens from the bottom, desktop from the side. The HTML prototype uses a native modal dialog with the same fields. Focus enters the overlay, Escape and cancel close it, and focus returns to its trigger. Apply commits the draft; cancel discards it. Reset filters preserves the selected date and location. Changes are reflected in URL state in production; Back/Forward restores controls and results together. Show unknown distance and pending location honestly; keep requested URL distance settings until location is resolved.

| State | Presentation and recovery |
| --- | --- |
| Initial loading | Matching card Skeletons, aria-busy, polite loading status |
| Refresh | Retain existing results/height; indicate pending data without blocking unrelated controls |
| No offers for date | State the full date; suggest another date |
| No filter matches | State criteria caused no matches; clear filters preserves date/location |
| Invalid price range | Inline error linked with aria-describedby; Field data-invalid, input aria-invalid |
| Location denied/unavailable | Manual address fallback; no distance sorting claims |
| Network error | Alert with retry; preserve date, location and filter draft |
| Mutation pending | Disable duplicate submission; Spinner and progress verb |
| Success/partial failure | Explicit result counts; retry only failed items |

Every action needs a keyboard-visible focus ring. Use semantic headings/landmarks, associated labels, live result counts and text alongside status color. Dialogs require titles; interactive chips require names including removal intent. Do not autofocus search on mobile. Diet labels describe submitted metadata and are not guarantees about cross-contamination.

## Delivery and remaining work

Delivered in the application: semantic light/dark tokens; shared Button/Input/Card/Select/Sheet styles; header and account navigation styling; a theme toggle persisted in a cookie and restored server-side; the browse introduction, seven-day selection with next-week/return-to-today actions, responsive offer cards, Polish prices and distances, truthful result counts and empty states. All eight cuisines, five dietary tags, price bounds and location-dependent radius remain available. Filters use a draft panel: apply commits to the URL; cancel/Escape restores the previous criteria; individual chips remove criteria. Search debounce, URL history, pagination and location fallback remain in place.

The offline prototype additionally demonstrates a detail modal using fictional offers and straight-line demo distances. Its navigation is labelled as a specimen. Offer detail, restaurant, chat, contribution, management and admin screens inherit shared styles but their screen recipes above still require a dedicated redesign. Location input behavior is preserved rather than replaced. No database, ingestion, ownership or RLS behavior was changed.

Production is served at [lunchagregator.vercel.app](https://lunchagregator.vercel.app) through the existing Vercel integration for `main`. Check the GitHub production deployment status and `/api/version` commit before treating a source publication as a completed rollout. This UI update requires no database migrations or new deployment secrets.

Prototype validation: T3 `html_preview` rendered 320px, 728px and 1280px layouts without horizontal overflow or JavaScript errors. The 320px dark specimen was visually inspected. Assertions exercised filtering, cancellation, reset, sorting, search, date/week selection, detail and theme switching. Five token contrast pairs per theme passed the thresholds above (lowest checked text ratio 5.57:1; lowest checked control outline ratio 3.27:1).

Application validation: the full unit/property suite passed (1,134 tests; seven skipped). Focused filter/theme regressions, typecheck/lint and `npm run build` passed; lint retains two pre-existing unused-variable warnings outside this change. All seven Chromium filter E2E scenarios passed against an isolated HTTP fixture, covering draft/apply/cancel at 320px and 1280px, history, refresh, invalid prices, search races and links without location. Separate browser checks at 320px, 768px and 1440px verified no horizontal overflow, Escape focus return, persisted dark mode, seven-day/week navigation and no page errors. Desktop and dark screenshots were visually inspected. A full screen-reader audit and explicit 200% zoom check remain outside this validation; database tests are not needed for the UI-only scope.
