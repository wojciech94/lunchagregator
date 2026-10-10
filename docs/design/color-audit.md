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
