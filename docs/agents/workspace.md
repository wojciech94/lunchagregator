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

Resolve the task's issue and intended PR base. Use `origin/main` for independent
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

## Before delivery

Fetch the actual remote base again. Check the diff from the merge-base, account
for newly merged changes, and verify the PR's current state before pushing.
For a merged or closed PR, use a new branch from the fetched base for follow-up
work rather than appending commits to its completed branch. Re-run affected
checks when code or base changes invalidate prior evidence; distinguish earlier
test runs from validation of the delivered revision.

Inspect `git status --short`, staged changes and the commit diff. Commit only
the task's files. Preserve unrelated edits; completion does not authorize
`reset --hard`, `clean`, deleting another worktree, force-pushing or merging.

Before reporting completion, update all affected documentation together:

- Repository docs describe the delivered behavior and current limitations.
- The PR describes its final scope, validation and remaining work.
- The issue records the current PR/merge status, completed stage, review fixes,
  evidence and the next unfinished stage. Only check off work actually delivered
  to the stated stage; clearly distinguish implementation from merge and pilot
  verification.

Re-read published issue/PR updates to verify them. Report the task branch,
delivered commit/PR, validation and material outstanding work. Leave a clean
checkout after committing this task, or explicitly identify any preserved
uncommitted work. These are agent workflow requirements; Git does not enforce
task ownership or fetch freshness automatically.
