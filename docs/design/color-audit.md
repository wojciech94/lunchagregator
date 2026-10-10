# Source color audit

Date: 2026-10-10. Scope: production UI source under `src`, following the approved DESIGN.md direction. The initial blue-hover fix and header reorder were merged in PR #143; this follow-up starts from `ac7061d`.

| Finding | Change |
| --- | --- |
| Amber/green palette classes in extraction, forms, publication, location and auth warnings | Central warning surface/text/border and success foreground tokens, with light/dark values |
| Emerald/violet/amber price-level labels | Shared outline Badge with the existing explicit price-level labels |
| Destructive Badge forced white text and a separate dark background | Shared destructive/foreground tokens |
| Slider thumb forced white | Card surface token |
| Checkbox, Textarea and Tabs had per-theme color overrides | One semantic style using theme variables |
| Add offer, account, logout, mobile location and restaurant edit overrode Button colors | Shared variants own colors; active navigation/account state uses attributes |
| Muted text lost contrast through opacity | Full muted-foreground token; underlined link hover changes decoration instead of text opacity |
| Local black card shadows and brightness hover | Flat surfaces and semantic accent hover; modal backdrops use the overlay token |

The post-change source scan checks raw hex/RGB/HSL colors, Tailwind named palette classes (including gradient/outline/decoration colors), manual `dark:` overrides, inline color properties and Button className overrides. It found no raw palette colors or manual dark color overrides outside `src/app/globals.css`. Hex-like issue numbers in comments are not colors. The central palette, including chart and modal-overlay roles, intentionally keeps literal color values. Semantic hover/state classes remain where appropriate; this audit does not forbid all local layout or state classes.

The standalone HTML prototype under `docs/design` deliberately owns its offline specimen palette and is outside production source scope. No arbitrary palette change was made to that artifact.

Validation includes typecheck/lint, the unit/property suite, browser inspection of restaurant metadata and action hover in both themes, plus computed contrast for warning and success token pairs. This is a source/style audit, not a complete screen-reader, contrast or accessibility certification of every rendered screen. No database mutations or migrations are required.

## Action consistency and dark palette follow-up

The follow-up from `d66f034` replaces the admin restaurant row's handwritten edit-link styles and the restaurant date-menu submit button with shared Button variants. The date field now uses Input. Outline and ghost buttons explicitly own their foreground, avoiding inherited muted text. Every Button variant reserves the same 1px border, and small/default buttons share 44px height and 8px corners; large buttons use 48px height. Destructive actions retain their distinct semantic color.

Dark surfaces now use warm charcoal/espresso with cream text and a terracotta primary/focus accent. Sidebar and chart-primary tokens follow the same palette. Success remains green to preserve its status meaning. Light colors are unchanged. DESIGN.md records the current production tokens; the offline prototype retains its historical palette.

Validation: `npm run lint` (two existing unused-variable warnings outside the changed files), `npm run typecheck`, and `npm test` (1179 passed, 8 skipped). A temporary local route rendered the real RestaurantDetail and shared controls with fixture data, including a muted-text parent. Browser checks covered light/dark foregrounds, edit/delete geometry, outline hover, keyboard focus, disabled controls, and no horizontal overflow at 320px. The fixture route was removed after inspection; no delete or publish action was invoked. Primary text contrast is 8.47:1 in dark mode, muted text is 6.79:1, and input outlines against cards are 4.86:1. Authenticated admin data loading was not exercised; its action composition was verified in source and uses the same rendered Button variants.

The public Pizza Si detail page also passed a 320px date-form check: submitting October 12 updated the date query, retained dark mode across navigation, and kept both Input and Button at 44px without horizontal overflow.
