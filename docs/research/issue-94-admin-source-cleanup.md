# Admin source clarity and Sofa guard (#94)

Independent base: `origin/main` `db1c22cd993a9c0ae00a11ec2c9706825f968b0e`.
Sushi Corner PDF implementation is delivered separately in PR #148; this stage
does not depend on or activate it.

The central Admin import page now names each source's Restaurant/address, links
its official menu and settings, and distinguishes active configuration, disabled,
draft, pending verification and unsupported trials. Inactive entries show their
saved source identity explicitly, rather than claiming those are current Restaurant
details. Only a successfully resolved active binding shows the fetch panel.
Configuration state does not attest current menu availability.

Sofa's pilot visibility discrepancy is displayed explicitly. Its adapter rejects
the lunch section if it or an ancestor has the known `hidden` class, HTML `hidden`,
`aria-hidden=true`, inline `display:none` or `visibility:hidden`. Rejection occurs
before AI analysis or creation of an editable publication review, both centrally
and from Restaurant details. Visible menus still require normal human date,
availability, price and channel confirmation. The guard does not execute JavaScript
or evaluate arbitrary CSS; absence of a hiding marker is not proof of visibility.
Older already-issued reviews are not retroactively revoked by this application
change; their existing 30-minute freshness/revision checks remain in force.

## Inventory and retained data

Read-only production Admin inventory on 2026-10-10 showed Doctor's Bar, Ida,
Meatologia, Pizza Si, Pod Latarniami, Sofa and Sushi Friends. No item was established
as an unnecessary temporary/test artifact. All were retained. No production
Restaurant, offer, binding, tombstone, correction or audit record was deleted or
changed; there is no bulk cleanup or migration in this stage.

Sofa remains unverified for current availability. Sushi Friends is distinct from
Sushi Corner; Meatologia is a separate pilot. Pod Latarniami's stored `ul. Ruska 5`
differs from the official address observed during research (`Ruska 3`); confirm
the exact branch before editing its identity. Offer dependency inventory and any
physical cleanup remain separate, evidence-based follow-up work. Missing ownership
alone does not identify a test artifact.

The five-business-day pilot still needs independently confirmed source membership,
actual dates, publication decisions and offer links. Code delivery/preview checks
are not pilot acceptance.

## Validation

Focused tests cover hiding markers on sections/ancestors, rejection before AI,
visible-menu preservation, Admin gating and central source statuses/links/errors.
No authorization, SQL, publication identity or RLS contract changes are introduced.

The 42 focused adapter/action/Admin-page tests passed, with typecheck and affected
ESLint clean. A fresh official Sofa browser inspection on 2026-10-10 reproduced
`hidden`, computed `display:none`, three raw occurrences of `40,31` and no visible
`40,31` in body text. This corroborates the specific guard; it does not identify
the site's hiding reason or current weekday lunch availability. The production
Admin Restaurant inventory was inspected read-only; no artifact was removed.
