# Plan: filter state in the URL (#8)

Decisions settled 2026-10-04 and recorded on issue #8. This file exists so the
plan survives a session boundary; it is a working note, not a spec. The
requirements themselves are in `requirements.md` (2.9-2.13) and the mechanism in
`design.md`.

## Where it stands

| Stage | State |
|---|---|
| Decisions | settled, on #8 |
| Spec written | `274db01` |
| Coordinates in an httpOnly cookie | `db73556` (PR #58, merged) |
| Server renders the list from the URL | `02f8e2f` |
| Form, search channel, auth links, missing-location notice | `9b12b7e` |

Both commits are on `feat/filter-state-in-url-stage2`, **not yet merged**.

## What the implementation does

- `src/lib/filter-url.ts` — parses a query string through the existing
  `offerFiltersSchema` (no second schema) and writes filters back. The radius
  is threaded separately in both directions, because `distanceFilterSchema`
  needs an origin the URL deliberately does not carry.
- `src/app/page.tsx` — accepts `searchParams`, passes filters and the cookie's
  coordinates to `getOffers`.
- `src/components/offers/OffersPage.tsx` — reads filters from the URL, writes
  through one path (push for committed filters, replace for typing, page reset
  to 1), and keeps **no** filter state.
- `src/components/offers/OfferFilters.tsx` — syncs its inputs from the URL and
  reports search on a separate `onSearchChange` channel.
- `src/components/auth/AuthNavLinks.tsx` — carries the current address into
  `?redirectTo=` so filters survive sign-in.

## Still open

- **PR not opened.** Both commits are pushed and verified; the review has not
  been requested yet.
- **`/restaurants` deliberately untouched.** Same mechanism, applied later.

## Still unverified

- **Requirement 7.2 on firefox and webkit.** Not installed. `npm run test:e2e`
  without `--project` fails because Playwright launches a browser before an
  in-body `test.skip` can run.
- **One unexplained test failure** seen once during this work, never
  identified, not reproduced across four subsequent runs. If it recurs, suspect
  ordering around the mutable `currentSearch` in the offers page suite.

## Where the decisions went

- The link-vs-mirror question, and why a mirror is out: issue #8.
- Mechanism, including why the URL carries a radius without an origin:
  `design.md`.
- Measured during the decision: `replaceState` does not increase
  `history.length`; an RSC round trip is 62-333 ms, inside Requirement 2.5's
  one-second budget.