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
| Coordinates in an httpOnly cookie | `db73556` |
| PR to merge | **#58** |
| URL as source of truth for filters | **not started** |

## Stage 2 — the URL carries the filters

The server can now see the location, which was the blocker. What is left is
the half that was always the visible complaint.

### 2.1 `app/page.tsx` reads the URL

- Accept `searchParams` and parse with the existing `offerFiltersSchema`. Do not
  write a second schema; two would drift.
- Pass the parsed filters to `getOffers`, along with the coordinates already
  available from the layout.
- Passing coordinates is what makes the first paint honour `sort=distance`
  instead of falling back to alphabetical (Requirement 1.2).

### 2.2 `OffersPage` reads from the URL

- `useSearchParams` is the source of truth; the `filters` state is deleted,
  not mirrored.
- **Unsure and unmeasured:** whether the component still needs `initialData`
  as a prop once the server renders from the URL. Probably not. Measure before
  assuming.

### 2.3 `OfferFilters` becomes controlled

The hard part. `OfferFilters` keeps internal state for its inputs today
(`searchQuery`, `isOpen`, and the rest via `buildFilters`). It has to become
fully controlled, or there will be two sources of truth again — the exact
failure that made option (b) unacceptable in the decision.

### 2.4 Write policy

- chips, sort, day, page → `router.push`, so Back undoes the last change
- search box → debounced `router.replace`, so typing does not create history
- any filter other than page resets `page` to 1

Verified during the decision: `replaceState` does not increase
`history.length` (4 → 4), `pushState` does (3 → 4), and an RSC round trip
costs 62–333 ms on the dev server, which fits Requirement 2.5's one-second
budget with room to spare.

### 2.5 Missing location does not edit the URL

`sort=distance` and `radius=5` stay in the URL. The page explains that
distance filtering needs a location and offers geolocation or manual address
entry, the way `LocationIndicator` already does.

This needs `permissionState` handled during render, which does not happen
today. **Do not** solve it by stripping parameters: the earlier decision to do
that was reversed because it breaks re-sharing and discards filters while the
browser is still asking for permission.

### 2.6 Filters survive sign-in

`/auth/*` already carries `?redirectTo=`. Add the filters so a signed-in User
returns to the filtered listing.

## Deliberately out of scope

- **`/restaurants`.** `RestaurantsPage` has its own filter set and the same
  defect (`restaurants/page.tsx` calls `listRestaurants({})`). The mechanism
  will be identical, so applying it there afterwards is mechanical. Doing both
  now means every change to the mechanism is made twice.
- **Screenshot comparison.** No reference images exist in this repository.

## Still unverified

**Requirement 7.2 on firefox and webkit.** Not installed; installing them was
out of scope. `npm run test:e2e` without `--project` fails for that reason,
because Playwright launches a browser before an in-body `test.skip` can run.

## Still open elsewhere

- `#13` — responsive E2E exists, 7.2 unverified on two engines
- `#8` — this plan; close when stage 2 lands
- `#6` — offers with no owner after the session-token migration (decision
  ticket, no implementation started)
- `#1` — the wayfinder map, stays open until the effort is done