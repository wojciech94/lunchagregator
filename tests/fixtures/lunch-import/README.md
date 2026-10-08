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

The test runner does not automatically load this key from `.env.local`. Do not commit credentials or print them. Optionally set `AI_SOURCE_DIAGNOSTICS=1` to print only extracted offers from these public fixtures. `AI_MODEL` and `AI_FALLBACK_MODEL` can override models **for the command process**; record them in the evaluation and do not treat an override as a change to deployed configuration. Calls use the application's shared 25-second deadline and no SDK retries. A primary HTTP 429 permits one alternate-model attempt, described below.

The corpus checks distinct rows, restaurant identity, base prices, weekday assignments and retained components/alternatives. Its textual checks accept wording variation and are not a semantic guarantee. The current Extraction contract has no fields for calendar dates, currency evidence, service channel, packaging supplements or freshness. These require independent source evidence and operator review; a passing extraction test does not mean publication is safe. The existing validator's `validOffers` classification alone is insufficient for imports.

## Acceptance gates

| Criterion | Evidence/status |
|---|---|
| Select 2–3 official Wrocław HTML sources | Sofa, PROST, Sushi Friends; HTTP 200 and named menu text observed |
| Establish expected dishes/prices/dates/conditions | Reviewed sets and Monday–Tuesday dishes in JSON; undated offers explicitly marked; PROST later days unresolved |
| Bind existing Restaurant branches; configure server sources | **Pending:** none of the selected branches exists in the configured database; this test corpus is not an enabled server-source registry |
| Verify simple and weekly Extraction live | **Passed for the new default `gemini-3.5-flash-lite`:** 6/6 live cases after correcting provider options; see evaluation below |
| Keep normal tests independent of provider | Live suite skipped unless explicitly opted in |
| Proceed to fetching/preview | **Not accepted yet:** resolve branch mapping; review PROST day layout or replace the source; preserve independent date/price review |

Do not add OCR/browser automation to hide these limitations. Missing-price mutations, whole stale weeks, HTTP failures, SSRF, concurrency and partial-publication fixtures belong to their respective later implementation stages. The current capture already contains past Monday–Tuesday dates and two undated menus; neither may be moved into a future week automatically.

## Live evaluation: 2026-10-07

All checks used the configured local key, public fixture inputs and no database writes. No deployed configuration changed. The proposed application default now uses `gemini-3.5-flash-lite`.

| Model | Check | Outcome |
|---|---|---|
| Previous default `gemini-3.8-flash` | Existing #89 simple/weekly suite, 3 cases | 3 failed: 2 unavailable responses, 1 timeout |
| Previous default `gemini-3.8-flash` | This source corpus, 3 cases | 3 failed: Sofa/Sushi HTTP 503; PROST 10-second timeout |
| Process override `gemini-2.5-flash` | Existing #89 suite, 3 cases | 2 passed; undated Pizza Si set failed the name-only Margherita assertion; output not retained, so no conclusion about whether components retained the name |
| Process override `gemini-2.5-flash` | Source corpus before stricter distinct-row assertions | PROST and Sushi passed dish/base-price/weekday/component checks; Sofa timed out |
| Process override `gemini-2.5-flash-lite` | Both suites | 6 failed; HTTP 404 for this integration/project; model listing did not guarantee generation availability |
| Process override `gemini-3.1-flash-lite` | Both suites, legacy provider options | 1 passed, 5 failed; 4 timeouts and PROST price/content mismatch; not accepted |
| Process override `gemini-3.5-flash-lite` | Both suites, legacy provider options | 6 failed; HTTP 400 |
| New default `gemini-3.5-flash-lite` | Both suites, corrected provider options | **6 passed**; individual calls 1.18–2.14 seconds in final run |

A sanitized minimal SDK probe returned HTTP 503 / `UNAVAILABLE` for the default model. The provider's model-list endpoint returned HTTP 200 and listed that model; this is not evidence that generation is operational. The alternative-model PROST result expanded the source's truncated `szparagow` to `szparagową`, lost surcharge evidence (no field exists), and assigned the generic juice to Monday. Those observations require review even though the core dish assertions passed. No repeated retry loop was run to seek a green result.

## Provider diagnosis and model choice

A minimal real-SDK probe held the model, prompt and schema constant: `gemini-3.5-flash-lite` with `thinkingBudget: 0` returned HTTP 400 (`INVALID_ARGUMENT`) in 464 ms; omitting that provider setting produced the expected price in 685 ms. A mocked-HTTP regression through the actual SDK and `analyzeText` failed before the fix and passed afterward. The shared primary options now send the numeric zero budget only to the two Gemini 2.5 Flash IDs; other models use provider defaults. The installed Google SDK does not support the newer `thinkingLevel` field, so it is not passed as an unsupported option.

Both services now use `gemini-3.5-flash-lite` primarily and try `gemini-3.1-flash-lite` once after a primary HTTP 429. This is an alternate-model attempt, not an SDK retry loop. A shared abort signal enforces the 25-second total deadline. Primary timeouts, 400/401/403, 503, invalid output and failures after a stream opens do not trigger a switch. A fallback error propagates through existing failure handling; no further models are tried. The fallback uses its own provider defaults, not settings copied from the primary model. Setting both model IDs equal disables the switch. Recommendation SDK retries are explicitly disabled so they cannot multiply attempts. The 12 focused mocked-HTTP tests cover initial 429 recovery for extraction and streaming, both models failing, non-429 errors, the shared deadline, incompatible thinking options and avoiding replay after stream text. A delayed fallback that completes at 15 seconds is also verified; it failed under the former 10-second cutoff. No rate limit was deliberately exhausted live.

The first corrected-options run passed all source cases but failed the old Pizza Si name-only assertions. A diagnostic run confirmed that the pizza name was preserved in the returned set fields. The live assertion now checks Margherita in name/description/components **on the 34 PLN row**, allowing a generic set title while still rejecting loss of the named component. The final run passed all six cases. This small sample does not guarantee uptime or extraction accuracy. The PROST output still inferred dietary/allergen labels and completed truncated wording; operator review and the import-specific publication contract remain required.

On the assessment date, Google's [pricing table](https://ai.google.dev/gemini-api/docs/pricing) lists free standard input/output for both 3.8 Flash and 3.5 Flash-Lite. It describes Flash-Lite as intended for high-volume, simple data processing. Free-tier availability does not establish the billing tier of the configured key. Check the key's project in [AI Studio rate limits](https://aistudio.google.com/rate-limit): RPM, TPM and RPD. [Google's limits documentation](https://ai.google.dev/gemini-api/docs/rate-limits) says quotas apply per project and actual capacity can vary. No specific project quota is claimed here. The observed 3.8 HTTP 503 is a generation availability failure, not evidence of quota exhaustion; compare [provider troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting).

The stage-0 gate remains open for branch binding and later-day mapping. Before stage 1, resolve selected branch IDs through the normal Restaurant flow in an agreed environment and verify later PROST mappings. No offers have been published.
