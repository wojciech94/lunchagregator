# Lunch Aggregator

Next.js (App Router) + TypeScript + Supabase (PostgreSQL + PostGIS). Zbiera oferty lunchowe z restauracji w promieniu X km od użytkownika, pozwala filtrować po cenie, kuchni i dietetyce, oraz rekomenduje miejsca na podstawie lokalizacji.

## Commands

```bash
npm run dev        # Next.js dev server
npm run build      # production build
npm test           # Vitest unit + property tests
npm run test:e2e   # Playwright E2E
```

## Conventions

- Zod waliduje dane wejściowe w server actions; schematy w `src/lib/validations/`, `src/schemas/`
- Supabase client w `src/lib/supabase/` — `client.ts` (browser), `server.ts` (server actions)
- Dostęp do zasobów chroniony `session_token` w bazie + RLS, nie przez JWT — patrz `src/lib/ownership.ts`
- Property tests (fast-check) mieszkają obok kodu jako `*.property.test.ts`; testy jednostkowe w `src/**/*.test.ts`
- Specyfikacje w `.kiro/specs/<feature>/` — requirements, design, tasks

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues in `wojciech94/lunchagregator`, driven through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: `GLOSSARY.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.