# Issue #94: stage-0 menu corpus

These are frozen public source observations from 2026-10-07, not publishable Lunch_Offers. See the [source assessment](../../../docs/research/issue-94-source-assessment.md) for primary-source links and selection decisions.

## Files and provenance

- `expected.json`: manually reviewed branch, base price, currency, date evidence and publication conditions. `restaurantId: null` means **unbound**, never permission to create or guess a Restaurant.
- `captures.json`: UTC retrieval timestamps, original HTTP response byte counts and SHA-256 hashes, plus hashes of committed HTML/text excerpts. Full responses are intentionally omitted because they contain scripts, unrelated menus and copied chat attributes.
- `<source>.html`: selected elements serialized from the fetched DOM, without running scripts. These are excerpts, not byte-for-byte full HTTP responses. Sofa captures category text and each item's title/description/price; Sushi captures lunch item blocks, the visible side-choice sentence and packaging sentence. PROST captures the menu's rich-text elements in their original document order, including the unreviewed later days.
- `<source>.txt`: whitespace-cleaned text of the reviewed elements, with line breaks for `br` tags and a manually supplied restaurant/branch context line. Context comes from the official pages cited in the assessment. No dates/prices were supplied by AI. PROST text intentionally contains **Monday and Tuesday only**; the later-day dish assignment remains unresolved.

Do not refresh these snapshots in place to make a failed extraction pass. Capture a new dated sample and review its expected values separately. The original response hash establishes the observed response; it does not promise that a future response will match it.

## Live check

Ordinary `npm test` skips the live corpus. To opt in, make `GOOGLE_GENERATIVE_AI_API_KEY` available in the process environment and run:

```powershell
$env:RUN_AI_LIVE = '1'
npm test -- src/services/ai-analyzer.live.test.ts src/services/lunch-import.live.test.ts
```

The test runner does not automatically load this key from `.env.local`. Do not commit credentials or print them. Optionally set `AI_SOURCE_DIAGNOSTICS=1` to print only extracted offers from these public fixtures. `AI_MODEL` can override the model **for the command process**; record it in the evaluation and do not treat an override as a change to deployed configuration. Calls use the application's existing 10-second deadline and no provider retries.

The corpus checks distinct rows, restaurant identity, base prices, weekday assignments and retained components/alternatives. Its textual checks accept wording variation and are not a semantic guarantee. The current Extraction contract has no fields for calendar dates, currency evidence, service channel, packaging supplements or freshness. These require independent source evidence and operator review; a passing extraction test does not mean publication is safe. The existing validator's `validOffers` classification alone is insufficient for imports.

## Acceptance gates

| Criterion | Evidence/status |
|---|---|
| Select 2–3 official Wrocław HTML sources | Sofa, PROST, Sushi Friends; HTTP 200 and named menu text observed |
| Establish expected dishes/prices/dates/conditions | Reviewed sets and Monday–Tuesday dishes in JSON; undated offers explicitly marked; PROST later days unresolved |
| Bind existing Restaurant branches; configure server sources | **Pending:** none of the selected branches exists in the configured database; this test corpus is not an enabled server-source registry |
| Verify simple and weekly Extraction live | **Failed for the default model:** 503 responses and timeouts; see evaluation below |
| Keep normal tests independent of provider | Live suite skipped unless explicitly opted in |
| Proceed to fetching/preview | **Not accepted yet:** resolve branch mapping and obtain a reliable default-model check; review PROST day layout or replace the source |

Do not add OCR/browser automation to hide these limitations. Missing-price mutations, whole stale weeks, HTTP failures, SSRF, concurrency and partial-publication fixtures belong to their respective later implementation stages. The current capture already contains past Monday–Tuesday dates and two undated menus; neither may be moved into a future week automatically.

## Live evaluation: 2026-10-07

All checks used the configured local key, public fixture inputs and no database writes. No deployed model/configuration changed.

| Model | Check | Outcome |
|---|---|---|
| Default `gemini-3.8-flash` | Existing #89 simple/weekly suite, 3 cases | 3 failed: 2 unavailable responses, 1 timeout |
| Default `gemini-3.8-flash` | This source corpus, 3 cases | 3 failed: Sofa/Sushi HTTP 503; PROST 10-second timeout |
| Process override `gemini-2.5-flash` | Existing #89 suite, 3 cases | 2 passed; undated Pizza Si set failed the name-only Margherita assertion; output not retained, so no conclusion about whether components retained the name |
| Process override `gemini-2.5-flash` | Source corpus before stricter distinct-row assertions | PROST and Sushi passed dish/base-price/weekday/component checks; Sofa timed out |

A sanitized minimal SDK probe returned HTTP 503 / `UNAVAILABLE` for the default model. The provider's model-list endpoint returned HTTP 200 and listed that model; this is not evidence that generation is operational. The alternative-model PROST result expanded the source's truncated `szparagow` to `szparagową`, lost surcharge evidence (no field exists), and assigned the generic juice to Monday. Those observations require review even though the core dish assertions passed. No repeated retry loop was run to seek a green result.

The stage-0 gate remains open. This PR supplies reviewable evidence and a reproducible check, rather than claiming the importer is ready. Before stage 1, resolve selected branch IDs through the normal Restaurant flow in an agreed environment, verify later PROST mappings, and rerun both live suites against the intended configured model.
