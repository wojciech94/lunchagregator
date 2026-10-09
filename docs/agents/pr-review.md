# Pull request reviews

Use this workflow when an automatic review is triggered or the user requests a
review. It defines review behavior; the configured integration owns automatic
review scheduling. Opening a PR does not trigger an additional review under these
instructions.

## 1. Pin the scope and sources

- Read the PR description and linked issues using the workflow in
  `docs/agents/issue-tracker.md`. Resolve the PR's actual base branch and head
  commit; record the head SHA. Use `git diff <base>...<head>` to review changes
  from the merge-base. Fetch missing refs before using them.
- Read applicable `AGENTS.md` instructions, relevant specs in `.kiro/specs/`,
  and domain decisions through `docs/agents/domain.md`. Follow the linked issue
  and explicit decisions to identify the applicable requirements; flag conflicts
  between sources instead of silently choosing one.
- If the diff is empty, report that. If a specification cannot be found, state
  that spec conformance could not be assessed and continue the correctness review.
  Report inaccessible sources or tools as limitations.

The scope is ready when the base, head SHA, changed files, and available
requirements are identified. Read changed code and its relevant callers,
consumers, and tests; a diff alone may hide a broken contract.

## 2. Review both perspectives

Keep the results of these perspectives distinct:

- **Spec conformance:** missing or partial requirements, incorrect behavior, and
  changes beyond the agreed scope. Reference the issue, requirement, or decision
  supporting each finding.
- **Correctness and standards:** regressions, broken contracts, and violations of
  documented repository conventions. Trace a concrete failure scenario before
  reporting a defect. Label design suggestions as suggestions; a heuristic is
  not a repository rule.

Independent subagents are optional when supported by the environment. Give each
the same pinned scope and relevant sources, then verify their findings against
the code. This workflow works without subagents or a locally installed skill.

Apply the following checks where the change touches the relevant behavior:

| Area | Check |
| --- | --- |
| Authorization | Verify application-side authentication/ownership or Admin checks and the effective RLS policies after all migrations. Neither layer substitutes for the other. Check unauthorized and cross-user paths. |
| Input | Validate untrusted server-action input with the relevant Zod schema; verify invalid-input and error paths. |
| Supabase contracts | Trace database rows through service mapping to their consumers. A type assertion does not transform snake_case fields into application fields. Check nulls, counts, and pagination. |
| Migrations | Check compatibility with existing data, effective policies, and application deployment order. State any required database rollout step. |
| Domain | Check affected invariants against the glossary and specs, including Snapshot display truth, ownership, restaurant linking, and menu dates/renewal. |
| UI | Reuse `ui/Button`, `ui/Chip`, and existing variants where applicable; respect documented exceptions. Check accessible names, keyboard interaction, and visible loading/error/empty states. |

## 3. Gather proportional evidence

Inspect relevant tests and CI results, then run checks that address unresolved
risks when the environment permits. Read available scripts from `package.json`.

- Use unit/property tests for logic and action contracts. Tests should exercise
  observable behavior and boundary cases rather than merely reproduce the code.
- For SQL, RLS, and PostGIS behavior, use real-database checks following
  `docs/agents/test-database.md`. Mocked unit tests do not verify those contracts.
- For interaction changes, use relevant E2E tests or a UI check, including the
  affected control's actual behavior. Report which kind of evidence was obtained.
- For documentation-only changes, check links, consistency, and whether the
  instructions can be followed on a representative PR.

Separate checks you ran from existing CI results and claims in the PR description.
Record relevant checks that could not run and why; passing tests do not by
themselves establish that the reviewed behavior is correct.

## 4. Report and follow up

Write the report in English. Use the review integration's required output schema
when present; otherwise give separate Spec conformance and Correctness/standards
sections, followed by validation and limitations. In either case, preserve each
finding's perspective and include the reviewed head SHA where the format permits.

Each actionable finding includes:

- Priority: P0 (critical), P1 (high), P2 (normal), or P3 (low).
- A file and the smallest useful line range in the reviewed change.
- The triggering scenario, observed or code-traced failure, and user/system
  impact. Cite the violated requirement or documented rule when applicable.
- Whether it is a blocking defect or a non-blocking suggestion, with a reason.

Report actionable issues introduced by the change. Mention pre-existing issues
only when needed to explain a new regression. Keep optional suggestions separate
from defects and avoid repeating findings already addressed in the reviewed SHA.
If no defects are found, say so and still state validation limits.

For a manual review, report in the conversation by default; publish GitHub review
comments only when authorized by the user. Automatic reviews use the configured
integration's publication destination and permissions. Review completion does
not authorize merging or changing the PR code.

After fixes, pin the new head SHA, verify each reported defect, and inspect the
new diff for regressions. Complete the review when both perspectives have been
assessed, findings are resolved or explicitly remain open, and validation limits
are recorded. Review assessment has no fixed number of rounds; autonomous delivery
and fix sessions use the limits and handoff rules in [pr-delivery.md](pr-delivery.md).
