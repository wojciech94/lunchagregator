# Lunch Aggregator UI direction

Status: proposed design, 2026-10-10. This is a reviewable direction, not a shipped application redesign. The [interactive prototype](docs/design/lunch-ui.html) uses fictional offers and local state, without APIs, authentication or database writes. Open that file directly in a browser. Polish is the product language; repository design documentation is English.

## Product intent

Help someone answer “What can I eat nearby on this date, within my budget?” in one scan. Use a warm paper background, forest-green actions, strong dish titles and aligned prices. Content must work without photography: the offer model has no image field. Avoid ratings, walking times, stock counts, “open now” or verified-source labels without supporting data.

The existing application uses Next.js App Router, Tailwind v4, shadcn New York with Radix, and Lucide. Keep that foundation. Preserve offer snapshots, URL filters and navigation history, location fallback, pagination, ownership checks and RLS.

## Foundations

Map these proposed values to existing variables in `src/app/globals.css` when implementing. The prototype scopes equivalent tokens to its screen; it does not change production CSS.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| background | `#F7F6F2` | `#141C18` | Warm canvas |
| foreground / card-foreground | `#202C25` | `#F1F4EF` | Titles and body |
| card / popover | `#FFFFFF` | `#1D2922` | Reading surfaces |
| primary | `#245C3D` | `#B9DEC1` | Main action, selected day |
| primary-foreground | `#FFFFFF` | `#14291C` | Text on primary |
| muted / secondary / accent | `#EDEFE8` | `#29372E` | Quiet surfaces |
| muted-foreground | `#59665D` | `#B4C2B7` | Supporting text |
| border | `#D9DED6` | `#46574B` | Decorative separation |
| input | `#839287` | `#819887` | Control outlines |
| ring | `#245C3D` | `#B9DEC1` | Keyboard focus |
| destructive | `#A52B26` | `#FFA8A1` | Errors and destructive actions |
| destructive-foreground | `#FFFFFF` | `#361511` | Text on destructive |

Use semantic tokens throughout components. Input outlines are stronger than decorative card borders. Never reduce text contrast with opacity. Check rendered contrast before production: at least 4.5:1 for normal text, 3:1 for large text and control boundaries/focus indicators. The prototype logs computed token-pair ratios for both themes; this is not a complete accessibility audit.

Keep Inter (already configured) for production. Prototype uses a system sans stack to run offline. Typography: page title 36/40 desktop, 28/32 mobile; section 24/30; dish 20/26; body 16/24; metadata 14/20; small label 12/18. Use weight 600 for titles, 700 for price, tabular numerals for prices. No all-caps form labels; small uppercase eyebrow labels are decorative context only.

Spacing scale: 4, 8, 12, 16, 24, 32, 48px. Cards have 24px padding (20px on mobile), 16px radius, 1px borders, no default shadow. Controls have 8px radius and minimum 44px touch targets. Badges use a full radius. Use `flex`/`grid` with `gap`, and `cn()` for conditional classes. Reserve shadows for overlays. Motion: 120–180ms color/opacity only; honor reduced motion.

## Browse screen recipe

1. Header: product name, Oferty, Restauracje, Czat AI, and account/contribution actions appropriate to auth state. Do not expose administrator actions in the public browsing navigation. Mobile menu retains every destination.
2. Compact introduction: “Dobry lunch. Blisko Ciebie.” Location appears next to this task context, with explicit change and manual-address entry. Request geolocation only on an intentional action.
3. Seven-day single selection plus a next-week action. All dates wrap visibly at narrow widths. Use Polish weekday labels and Europe/Warsaw menu dates from existing helpers, not UTC date slicing. Selecting next week replaces the date window and selects its Monday.
4. Search, filter control with an active count, and sort. Selected criteria remain visible as removable chips. Production requires the full existing price min/max, eight cuisines, five dietary tags and distance radius; the prototype intentionally demonstrates a subset. Search retains the existing minimum-two-character and debounce contract.
5. Result count with full selected date and truthful sorting label. Default order remains distance when location exists, otherwise restaurant name. No unsupported “recommended” sort.
6. Equal-weight offer cards: cuisine; dish title; full formatted price; restaurant snapshot; description; items; diet tags; distance when available; one “Zobacz ofertę” action. Never invent zero distance for unknown coordinates. No nested interactive controls inside a linked card.
7. Detail: full dish/price/date, snapshot restaurant/address, description/items/diet/allergen data, then restaurant link when associated. Missing allergens mean unknown, not allergen-free. Lunch hours may come from associated restaurant metadata and must be labelled as restaurant hours. Expired or withdrawn records must not look available.

## Other screens

- Restaurants: same header, location, search/filter recipe and quiet cards; show address and cuisine before secondary metadata. Detail introduces restaurant information, then date-specific offers.
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
| Date choices | Add ToggleGroup with single selection; reject empty value so a date stays selected |
| Search | Add InputGroup + InputGroupInput + InputGroupAddon; visible or screen-reader label |
| Filter panel | Existing Sheet with SheetTitle, description, FieldGroup + Field; draft/apply/cancel semantics |
| Diet controls | Add ToggleGroup multiple; use FieldSet/FieldLegend for related checkboxes |
| Sort | Existing Select with SelectGroup containing SelectItem |
| Location | Existing Dialog with DialogTitle; retain AddressInput and permission fallback |
| No results / failure / loading | Add Empty / Alert / Skeleton, Spinner; stable results region with aria-busy |

Components listed as “add” are not currently installed. Inspect them through CLI search/view before installation. No preset switch or bulk component overwrite is necessary. Do not use per-screen `className` overrides for component colors/typography; change tokens and variants. Keep Lucide icons with `data-icon` in buttons and an accessible label for icon-only actions.

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

Delivered: this specification and an offline responsive prototype with date/week selection, search, maximum price, cuisine/diet/distance filtering, sorting, filter apply/cancel/reset, detail modal and light/dark specimens. Fictional distances are straight-line demo values. Prototype navigation is labelled as a specimen rather than connected application navigation.

Next implementation stage: apply global tokens and shared variants; migrate browse/header/location components; preserve existing filter/date/history tests; cover new draft/apply/cancel behavior; inspect offer detail and management screens; validate contrast, keyboard, 320px/desktop reflow and both themes; run affected lint/typecheck and behavioral regressions. Database and ingestion behavior do not need to change for this direction.

Validation of this proposal: T3 `html_preview` rendered 320px, 728px and 1280px layouts without horizontal overflow or JavaScript errors. The 320px dark specimen was visually inspected. Browser assertions exercised price+cuisine apply, cancellation of a draft, reset, price sorting, empty search, day/week selection, detail open/close and theme switching. Five token contrast pairs per theme passed the thresholds above (lowest checked text ratio 5.57:1; lowest checked control outline ratio 3.27:1). Keyboard/screen-reader testing, 200% zoom and production integration remain for the implementation stage. No production build or database tests were run for this standalone proposal.
