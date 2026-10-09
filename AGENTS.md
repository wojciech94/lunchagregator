# Lunch Aggregator

Next.js (App Router) + TypeScript + Supabase (PostgreSQL + PostGIS). Zbiera oferty lunchowe z restauracji w promieniu X km od użytkownika, pozwala filtrować po cenie, kuchni i dietetyce, oraz rekomenduje miejsca na podstawie lokalizacji.

## Commands

```bash
npm run dev        # Next.js dev server
npm run build      # production build
npm test           # Vitest unit + property tests
npm run test:e2e   # Playwright E2E
```

Baza testowa: lokalny stos (`npx supabase start`) — patrz `docs/agents/test-database.md`. `npm test` nie łączy się z bazą (projekt `unit`, `tests/setup.ts` mockuje `@supabase/ssr`); testy na prawdziwej bazie uruchamia `npm run test:db` (projekt `db`).

## Conventions

- Write new repository documentation, issues, and pull requests in English.
- Zod waliduje dane wejściowe w server actions; schematy w `src/lib/validations/`, `src/schemas/`
- Supabase client w `src/lib/supabase/` — `client.ts` (browser), `server.ts` (server actions)
- Dostęp do zasobów chroniony dwukrotnie: politykami RLS w bazie (`auth.uid() = user_id`, migracja `20250101000000`) **i** kodem aplikacji (`getUser()` + `checkOwnership()` w `src/actions/*.ts`). Żadna z tych warstw nie wystarcza jako jedyna — każda zakłada, że druga może zawieść. Polityki `USING (true)` z `20240202000000` są nieaktualne i obalone; patrz nagłówek tego pliku.
- Property tests (fast-check) mieszkają obok kodu jako `*.property.test.ts`; testy jednostkowe w `src/**/*.test.ts`
- Specyfikacje w `.kiro/specs/<feature>/` — requirements, design, tasks

## Workspace and task lifecycle

Before starting implementation, resuming work, switching tasks, or handing work
back, read and follow `docs/agents/workspace.md`. One active task owns each
worktree. Verify the working tree, fetch the actual remote base, and record its
SHA before editing; keep existing issue/PR records and affected repository
documentation current when delivering changes.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues in `wojciech94/lunchagregator`, driven through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: `GLOSSARY.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.

### Pull request reviews

When publishing a PR, waiting for automated feedback, or resuming review fixes,
read and follow `docs/agents/pr-delivery.md`, including its recorded session limits
and handoff criteria.

When performing an automatic or user-requested PR review, read and follow `docs/agents/pr-review.md`. Review both issue/spec conformance and correctness/repository standards. Automatic review is configured externally; opening a PR does not require an additional agent-initiated review.
