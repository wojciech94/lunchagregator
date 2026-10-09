# Materialize recurring menus as dated offers

For #139, recurring schedules become the source of truth and materialize ordinary dated Lunch_Offers. PostgreSQL reconciles each restaurant atomically under a shared restaurant lock; the initial publication fills 30 calendar dates and a persistent pg_cron runner maintains the horizon. This preserves existing offer identities, routes and filtering while preventing an outdated worker from restoring a stopped or edited menu.

Query-time virtual offers were rejected because they would add a second identity/detail model and broaden changes to pagination and editing. Revisions and explicit day exceptions preserve historical snapshots; one shared visibility view governs public listings, counts and detail access. The business calendar is Europe/Warsaw. This supersedes the no-automation decision from #71 only after an owner explicitly configures and activates a schedule; legacy flags alone do not activate recurrence.
