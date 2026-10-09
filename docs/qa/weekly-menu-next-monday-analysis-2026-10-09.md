# Recurring menu missing on next Monday

Analysis date: 2026-10-09. Target date: Monday, 2026-10-12.

## Conclusion

The missing menu is explained by the implemented recurrence semantics: `restaurants.menu_recurs_weekly` is an intent marker for manual renewal, not automatic recurrence. Public listing returns offers with an exact `available_date`; it neither projects an older weekly menu onto a requested date nor creates future offers. No offers exist for October 12 in the configured database.

This is an expectation gap relative to the reported desired behavior. The current behavior follows Requirement 8.7, which explicitly forbids automatic renewal. Fixing automatic recurrence requires changing that product decision, rather than repairing a weekday calculation.

## Observed database evidence

Read-only queries used the database configured by `.env.local`, the public Supabase client and anonymous credentials. No records were modified. This environment was not independently established to be the deployed production environment.

- **Pizza Si:** `menu_recurs_weekly = true`. Five offers exist for October 5–9, one per weekday. The October 5 offer is “Pizza Salami Napoli + Napój”. No offers for this restaurant were found for October 12–19 in the inspected September 28–October 19 interval.
- **Sushi Friends Bar & Resto:** `menu_recurs_weekly = true`. Four offers, “Lunch I” through “Lunch IV (wegetariański)”, exist on October 9 only within that interval. No Monday source offer was found.
- `get_offers_filtered(p_date = '2026-10-05', p_limit = 50, p_offset = 0)` returned one offer, belonging to Pizza Si, without an RPC error.
- The same RPC for `2026-10-12`, with no price, distance, search, cuisine or dietary restrictions, returned **zero offers**, without an RPC error. The empty result is therefore present before browser rendering and optional filters.
- The nine October 5–9 source offers have non-null owners and share one owner. The signed-in user's identity and ownership of the restaurants were not checked.

## Reproduction

A minimal read-only assertion against the real RPC failed with exit code 1:

```text
Expected Pizza Si recurring Monday menu on 2026-10-12
```

Run this from the repository root in PowerShell to repeat the same diagnostic. It asserts the user's desired recurring behavior; failure is expected with the current implementation and observed data. The result can change if someone publishes or renews offers.

```powershell
@'
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());
const { createClient } = require('@supabase/supabase-js');
const assert = require('node:assert/strict');
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);
(async () => {
  const { data, error } = await db.rpc('get_offers_filtered', {
    p_date: '2026-10-12', p_limit: 50, p_offset: 0
  });
  assert.equal(error, null, 'RPC should accept next Monday');
  assert.ok(data.some(x =>
    x.restaurant_id === '8cd28cd1-07c1-4794-9217-a1d7c98dbf25'
  ), 'Expected Pizza Si recurring Monday menu on 2026-10-12');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
'@ | node
```

## Causal chain and rejected explanations

1. `src/components/restaurants/RestaurantForm.tsx:313` saves the recurrence flag. Its help text explicitly says nothing publishes automatically.
2. `src/actions/restaurants.ts:432` updates the boolean; there is no invocation of menu renewal in that update path.
3. `src/components/offers/OffersPage.tsx:115` forwards the chosen date into the URL filters. `src/actions/offers.ts:29` validates them and calls the listing service.
4. `src/services/offers.ts:845` lists offers and passes the date to `get_offers_filtered`. The latest definition in `supabase/migrations/20261007000000_fix_default_distance_sort.sql:61` uses `WHERE lo.available_date = p_date` and does not consult the restaurant's recurrence flag. The separate count query also matches the exact date (`src/services/offers.ts:778`).
5. Only an explicit renewal call creates next week's offers. `src/lib/offer-renewal.ts:140` maps each source date to that date plus seven days. It preserves the source weekday.

Ranked explanations checked:

- **No automatic recurrence:** confirmed by the database results, update/listing paths, migration comments and Requirement 8.7.
- **Wrong future date in the query:** rejected for this scenario. The RPC accepts October 12 without error; the listing unit test also verifies forwarding an explicit future date.
- **Monday inaccessible in the day selector:** rejected for October 9. A deterministic check of the actual `upcomingDays(7, new Date(2026, 9, 9, 12))` helper includes October 12. The selector covers today through today + 6; next Monday is outside it when today is Monday, a separate limitation.

## Additional finding: weekly versus daily recurrence

Manual renewal of the observed Pizza Si sources on October 9 produces targets October 12–16. It can resolve Pizza Si's missing Monday, assuming the caller owns the restaurant and source offers and the inserts succeed.

Manual renewal of the observed Sushi Friends sources produces four offers on **Friday, October 16**, not Monday, October 12. If those lunches are actually available every working day, the saved Friday-only dates do not encode that schedule. The weekly flag cannot express “the same dishes every lunch day”; it only marks the restaurant, and renewal preserves weekdays. Restaurant opening days and actual intended menu availability were not independently verified, so daily availability remains a question about source data, not an established restaurant fact.

The renewal button is currently rendered only in **My offers → Expired** (`src/app/my-offers/page.tsx:252`). On October 9, Pizza Si has earlier expired weekday offers, but Sushi Friends' observed October 9 offers are still current. That UI placement can delay discovery of renewal for a newly added menu until an offer expires. The underlying service can renew current offers too.

## Proposed resolution

For the existing workflow, the owner can explicitly renew Pizza Si from the expired tab and inspect the created/skipped/failed summary. Sushi Friends needs an accurate availability schedule first if its menu should appear on Monday; weekly renewal of Friday-only offers is insufficient.

For the desired automatic behavior, define a persistent recurring menu template with explicit applicable weekdays, activation and revocation, and clear precedence for date-specific overrides. Distinguish a weekday-specific rotating menu from a fixed menu available on multiple working days. Choose either scheduled creation of dated offers or query-time projection from that template. Scheduled creation fits the existing dated-offer IDs and detail/edit routes, but needs idempotency, an appropriate publication horizon and reliable execution before visitors browse future dates. Do not simply move historical offers forward or blindly copy every past dish: that can restore withdrawn dishes and duplicate offers.

Automatic behavior would require updating Requirement 8.7, the design, glossary, flag help text and tests. Query-time projection would additionally require consistent listing counts, pagination, distance filtering and detail-page identity. These are proposed changes, not changes made during this analysis.

## Validation and scope

Targeted checks: **48 tests passed across four files**. These covered the existing renewal planner (14), listing service (19), offer-page filter handling (12), and three temporary deterministic probes for October 12 selection, Pizza Si renewal targets and Sushi Friends Friday-only targets. The temporary probes were removed after the investigation; existing tests were unchanged.

Invocation:

```text
npm test -- src/lib/weekly-menu-diagnostic.test.ts src/lib/offer-renewal.test.ts __tests__/unit/services/offers-listing.test.ts src/components/offers/OffersPage.filters.test.tsx
```

The first file was a temporary diagnostic and is no longer present. The other three suites remain runnable. No application fix, publication, renewal, schema migration or write to the connected database was performed. Browser rendering was not inspected; the direct database/RPC evidence establishes the missing result independently of the UI. No ADR directory exists in this checkout; the relevant decision is recorded in the glossary, lunch-aggregator specification and flag migration.
