# PR delivery and review feedback

Read this procedure when publishing a PR, monitoring its automated review, or
resuming work on review feedback. Follow [workspace.md](workspace.md) for the
worktree and validation gates. Follow [pr-review.md](pr-review.md) when assessing
findings. The external integration schedules automatic reviews.

## 1. Publish and record the session

After validating the final diff, commit only task files, push the task branch,
and create the PR with `gh pr create --body-file <file>`. Use English for the PR
and published replies. If creation has an ambiguous result, look for an existing
PR for the branch before retrying. Record its URL, number, base and head SHA.
In T3, immediately register the URL with `link_pull_request` when available.

Before waiting, record durable session state in the owning thread (or a local
task note outside tracked files): PR URL, session start and absolute deadline,
current head SHA and publication time, fix-round count, handled comment IDs,
unresolved findings, and validation evidence. Preserve these fields across
resumes. Start one session for this PR; only explicit user instruction extends
its budget. Read numeric defaults from
[`scripts/pr-review-policy.json`](../../scripts/pr-review-policy.json).
The round limit counts batches of review fixes pushed, not wake-ups or comments.
After the last permitted batch, inspecting its review is still allowed within the
original time budget; another fix batch requires a handoff.

## 2. Wait for evidence

Read existing feedback before subscribing. In T3, use `watch_pull_request` and
end the turn. On each wake, reread session state and check its deadline before
continuing. Inspect GitHub and enforce the round limit before further fixes.
Use this event path instead of a parallel polling
loop. The watcher may remain asleep during silence: its deadline is checked on
wake, not enforced by a timer. Report that limitation; use a supported independent
deadline trigger only if the environment provides one. This procedure does not
install a recurring scheduler or claim a hard timeout for the native watcher.

Without a native watcher, use the read-only bounded helper:

```text
node scripts/wait-for-pr-review.mjs --repo wojciech94/lunchagregator --pr <number> --head <40-character-SHA> --bot <reviewer-login> --published-at <ISO-publication-time> --deadline <original-ISO-session-deadline>
```

The helper polls through `gh`, caps each API read and sleep, and stops at the
earlier of the revision wait limit and original session deadline. Reuse the
original timestamps on retries. Exit codes: `0` means feedback exists to inspect,
`2` means timeout, `3` means closed PR or changed head, `1` means invalid input or
API failure. Resolve API failures before retrying within the remaining budget.
Never run the helper alongside a native watcher.

Determine the actual configured reviewer login from the integration or existing
reviews. The helper recognizes completed GitHub reviews for the exact head SHA;
it includes `COMMENTED` and `CHANGES_REQUESTED`, neither of which means approval.
It paginates reviews and rechecks the PR state/head after fetching them, within
the same request budget. A bot that posts only issue comments or checks needs manual
inspection and explicit revision-specific completion evidence; the helper will
time out rather than infer completion from silence or an unrelated comment.

## 3. Inspect feedback and fix verified defects

Use `gh pr view` for state/head/base and `gh pr checks` for CI. Use paginated
`gh api` requests for reviews, issue comments, inline review comments and GraphQL
review threads (including resolution state). A comments-only view is incomplete.
Confirm the PR is open and the head matches the recorded revision before edits
or pushes. Treat a changed head as a scope change to inspect, not permission to
overwrite another author's work.

Associate findings with their reviewed SHA and stable comment/thread IDs. Verify
each defect against the code and requirements, distinguish suggestions, and batch
related fixes. Test affected behavior according to workspace.md. Stop when the
same blocking finding recurs after a verified fix without new evidence or progress;
record the disagreement instead of repeating the same edit.

After each fix push, increment the round count and record the new SHA and its
publication time, preserving the original session deadline. Reply in each original
thread with the commit and validation; resolve verified defects and explain open
or disputed findings, following workspace.md. Update PR/issue scope and evidence.
Check whether the integration reviews updated heads; request another run only
through its documented mechanism. Re-enter waiting only within remaining limits.

## 4. Finish or hand off

Before declaring ready, verify the current head again, required checks, completed
review evidence for that head, and all findings/threads. An old approval, a timeout,
missing checks, or no comments is insufficient. When completion cannot be proven,
report pending review/CI or unresolved findings explicitly.

At a time limit, exhausted fix rounds with further defects, API blocker, lack of
progress, or closed/merged PR, stop automated
fixes and hand back the exact state and next action. A closed or merged PR requires
a new task branch for further implementation, per workspace.md. The limits bound
autonomous work; they do not authorize leaving defects marked as fixed.

Before handoff in T3, verify PR registration with `list_thread_pull_requests`, link
any missing PR from this work, and call `unwatch_pull_request`. Report failures of
these calls. Update existing issue/PR records and include URL, final SHA, validation,
round count, and remaining work. Merge remains a separate authorized action.

## Enforcement boundary

AGENTS.md makes this procedure mandatory for repository agents. The helper
enforces one wait's time and revision bounds; its regression tests run with the
unit suite. Round counts and the whole-session budget are agent obligations,
recorded across resumes, not an external execution lock. Native T3 monitoring and
GitHub branch protection are external configuration. This change neither modifies
branch protection nor guarantees that every agent follows written instructions.
