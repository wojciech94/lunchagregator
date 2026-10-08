# Issue #94: second preview source, Sushi Friends

The Admin import page now has independent Sofa and Sushi Friends controls.
The Sushi source is the official HTTPS home page. Set
`SUSHI_IMPORT_RESTAURANT_ID` to the reviewed branch UUID in the environment.
Its default identity is `Sushi Friends Bar & Resto`,
`ul. Marco Polo 9e, Wrocław`. When an independently reviewed record uses a
different address spelling, set `SUSHI_IMPORT_BRANCH_ADDRESS` to that exact
stored address. The action still rechecks both name and exact address on each
request; it does not find or create a branch by fuzzy matching. Local operator
data uses `ul. Marco Polo 9e`, configured in the ignored local environment file.

Fetching uses the existing pinned-public-IPv4 transport, deadline and body limit.
Each source accepts only its own fixed HTTPS URL: redirects between Sushi and
Sofa, arbitrary URLs and credentials in URLs are rejected. Disabled source IDs
are rejected before external requests.

The Sushi adapter reads only `#lunch` item titles, descriptions and prices. It
retains the visible common-side sentence and separately labels packaging text
from the delivery section. Copied chat attributes, scripts, unrelated menu items
and delivery-fee prices are not input to the extractor. Missing or ambiguous
prices remain null in direct HTML output while their literal text remains in
the source excerpt. Packaging is never added to the observed base prices.

Both sources use the existing AI extractor and the explicitly labelled direct
HTML preview if AI reports temporary unavailability or the complete analyzer
input (Restaurant name, address and excerpt) exceeds 5,000 characters. Long
menus skip AI and preserve all source dishes and evidence with a distinct
length warning; the fetched HTML remains subject to the 2 MB transport limit.
They return no inferred
dates, dietary tags or allergens. Sushi's explicit vegetarian wording remains
part of the literal title in the source excerpt and direct HTML output, not a
separately inferred tag. AI output may shorten the title, so the excerpt remains
the reference for explicit source labels. Operator review of
the service channel, packaging conditions, alternatives and calendar date is
still required before publication. No offers are saved by this increment.

## Verification

- PR review follow-up: both sources are tested at complete analyzer input
  lengths of 4,999, 5,000, 5,001 and 6,000 characters. Inputs within the limit
  reach AI unchanged; longer inputs preserve the complete excerpt and literal
  dishes, show a length warning, and make no AI request. UI checks distinguish
  HTML output from AI output and display the fallback reason. The follow-up
  suite passed 66 tests (including 9 shared analyzer tests), with 3 opt-in live
  cases skipped; typecheck and production build passed. The full suite was not
  rerun for this focused follow-up.
- Frozen Sushi excerpts with synthetic structural wrappers test four rows,
  31/36/41/31 PLN prices, common side alternatives, packaging wording, unrelated
  items/chat-attribute exclusion, missing menus and ambiguous price evidence.
- Transport regression verifies the Sushi host and rejects a redirect to Sofa.
- Action tests cover disabled/unknown sources, correct Sushi binding, reviewed
  address variants, changed-branch refusal and source-specific fallback.
- UI regression verifies that selecting Sushi sends the Sushi source ID and
  does not disable the Sofa control.
- A direct live HTML adapter check on 2026-10-08 returned all four expected
  prices and the miso/wakame alternative, without calling AI. This is a source
  observation, not proof of date-specific availability.
- Initial focused import suite before the review follow-up: 48 passed,
  3 opt-in live corpus cases skipped;
  production build and typecheck passed (existing unrelated build warnings).
- Collaborative-browser verification used the local pilot Admin session:
  selecting Sushi produced four AI-extracted rows at 31/36/41/31 PLN, retaining
  the miso/wakame choice and displaying source conditions and an unknown date.
  Both source buttons were enabled independently. No offers were published.

This adds the second source for stage-1 preview. Stage 2 (corrections, explicit
date approval, idempotent publication and the five-business-day pilot) remains
separate implementation work within issue #94. PROST remains unconfigured.
