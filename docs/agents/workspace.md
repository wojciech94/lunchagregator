# Workspace and task lifecycle

## Before editing

Run these checks in the task's actual working directory, including when resuming
after a handoff or interruption:

```bash
git rev-parse --show-toplevel
git branch --show-current
git status --short
git worktree list
git remote -v
git fetch origin
```

Resolve the task's requirements from its existing issue or the user's request,
and identify its intended base. Use `origin/main` for independent
work unless the task specifies another base. Resolve the fetched base with
`git rev-parse origin/main` (or the specified ref), and report the directory,
task branch and base SHA before implementation. A local branch named `main`
and a previously fetched `origin/main` are not evidence of current remote state.
If fetching fails, report that freshness is unverified and resolve the failure
before starting independent implementation.

The start gate is met when the task owns the directory, the base was fetched
successfully, and every local change is accounted for. A new task starts with
an empty `git status --short`. On resumption, existing changes belonging to that
same task may remain; inspect them and record which work is already complete.
Preserve unexplained or unrelated edits and use a separate worktree instead of
discarding, committing or stashing someone else's work.

## Isolate tasks

One active task owns one branch and one worktree. Parallel tasks use separate
worktrees, even when one directory currently has no uncommitted changes. Check
available app/thread ownership information as well as `git worktree list`:
Git lists checkouts, not active agents, and a clean checkout may still be in use.
If ownership cannot be established, choose a new worktree.

For a new independent task, create its branch from the fetched remote base.
When using a thread launcher, select the worktree in the launch request; shell
`cd` alone does not change the application's thread/workspace binding. In a
terminal-only environment, use `git worktree add -b <task-branch> <new-path>
origin/main`, then verify the directory and branch there before editing.

Sequential reuse is allowed after the previous task has been delivered or
explicitly handed off, its remaining work is recorded, no other agent owns the
directory, and the checkout is clean. Switch to a new task branch from the
freshly fetched base. Keep a paused task's branch intact. A new stage of an issue
counts as a new task; a review fix for the existing PR continues that PR's task.

For an intentional stack, name the parent branch/PR explicitly and record its
SHA. Uncommitted edits are not a stack base. Inspect ahead/behind commits on a
resumed branch; update it using the repository's normal merge/rebase workflow
when base changes affect the task, preserving its commits and local work.

## Check local services

Ignored environment files, running processes and databases are outside Git's
clean-state check. Verify which checkout owns the dev server, which port it
uses, and which database URL the task targets. Separate ports and build output
for parallel apps; coordinate shared databases and migrations. Read
`docs/agents/test-database.md` before database work. Preserve pilot data and
credentials, and report missing configuration without printing secrets.

Run development and production builds sequentially in a checkout because both
write `.next`. Restore any local service paused for validation and verify its
response before handing the task back. A page left open in a browser does not
prove that the server is running the intended checkout.

## Choose proportional validation

Batch related edits, then run the smallest checks that address their risks.
Reuse passing evidence while its inputs and relevant contracts are unchanged;
neither elapsed time nor the number of edited lines decides whether to rerun.

| Change since the last passing check | Next check |
| --- | --- |
| Ordinary docs or issue/PR wording | Check the diff, links and consistency. Reuse code validation. |
| UI copy or local styles | Lint affected code and inspect the affected UI when needed. A full build is usually unnecessary. |
| Local behavior | Run focused regression tests and affected lint/typecheck. |
| Imports, routing, server/client boundaries, dependencies or build configuration | Run the relevant typecheck/build and affected tests; one line may invalidate prior evidence. |
| SQL, RLS or PostGIS | Verify affected behavior on the real test database; a build does not verify SQL. |
| Rebase or merge | Inspect changes to the base and rerun checks whose inputs or contracts changed. |

Run a full suite or production build at a meaningful checkpoint when the risk
warrants it, rather than after every small edit. Meet required CI checks on the
delivered revision. Equivalent successful CI on that SHA may replace a duplicate
local run. Report the command, scope and checked revision, and distinguish reused
evidence from new checks. A repeat needs a reason: changed inputs, a failed check,
a new concern or an outstanding required gate. A brief PR validation note is
enough; no separate validation ledger is required.

The `Quality` GitHub Actions job runs lint, typecheck and unit/property tests for
code or configuration changes. Ordinary Markdown under `docs/` and `.kiro/`,
and the named root documentation files in that workflow, skip those steps.
File moves are classified using both their original and destination paths. The
job still reports success so it can be used as a required check. Builds, E2E and
database tests remain risk-based checks; this job does not validate their contracts.

For browser checks, inspect only the affected flows unless a broad audit was
requested. If automation reports an unavailable host, or a corrected retry still
fails, stop repeating the same operation. Use an available supported fallback or
report the exact unverified scenario and any human step needed to unblock it.

## Before delivery

Fetch the actual remote base again. Check the diff from the merge-base, account
for newly merged changes, and verify the PR's current state before pushing
when a PR exists.
For a merged or closed PR, use a new branch from the fetched base for follow-up
work rather than appending commits to its completed branch. Re-run affected
checks when code or base changes invalidate prior evidence; distinguish earlier
test runs from validation of the delivered revision.

Inspect `git status --short`, staged changes and the commit diff. Commit only
the task's files. Preserve unrelated edits; completion does not authorize
`reset --hard`, `clean`, deleting another worktree, force-pushing or merging.

Before reporting completion, update affected repository documentation and any
existing issue/PR records together:

- Repository docs describe the delivered behavior and current limitations.
- When a PR exists, it describes its final scope, validation and remaining work.
- When an issue exists, it records the current PR/merge status (if applicable),
  completed stage, review fixes, evidence and the next unfinished stage.
  Only check off work actually delivered
  to the stated stage; clearly distinguish implementation from merge and pilot
  verification.

Re-read any published issue/PR updates to verify them. Tasks requested directly
by the user or delivered locally can complete without tracker artifacts; this
workflow does not require creating an issue or PR solely to satisfy the checklist.
Report the task branch, delivered commit/PR when present, validation and material
outstanding work. Leave a clean
checkout after committing this task, or explicitly identify any preserved
uncommitted work. These are agent workflow requirements; Git does not enforce
task ownership or fetch freshness automatically.

When addressing PR feedback, finish each verified fix with an English reply in
its original review thread, citing the commit and relevant validation. Resolve
the thread after verifying that its reported defect is fixed; leave unresolved
or disputed findings open with an explanation. Inspect the review threads before
reporting completion so the user does not need to request these steps separately.
