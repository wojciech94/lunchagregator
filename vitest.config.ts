import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { loadEnv } from 'vite';

/**
 * Two projects, because two things genuinely need different environments.
 *
 * `unit`  Node, and `tests/setup.ts` mocks `@supabase/ssr` and `next/headers`
 *         globally. No test in this project can reach a database, by design:
 *         unit tests assert what the code does with a client it was handed.
 *
 * `db`    Node, and pointed at the local Supabase stack. It uses
 *         `tests/setup.db.ts`, which mocks nothing. This is the only project
 *         that can execute SQL, so it is the only place PostGIS, RLS and
 *         migration state are actually verified.
 *
 * `npm test` runs `unit` only, so the suite stays runnable without Docker.
 * `npm run test:db` runs `db` and needs `npx supabase start`.
 *
 * On environments: every `.tsx` suite declares `jsdom` in a
 * `@vitest-environment` docblock, which is the mechanism Vitest documents and
 * the one three suites already used. `environmentMatchGlobs` is gone: Vitest
 * 3.2.7 lists it under `UnsupportedProperties` for project config, so it did
 * not typecheck here, and moving it to the root level does not propagate into
 * projects -- verified, five suites fail with "window is not defined".
 */
const alias = { '@': path.resolve(__dirname, './src') };

const exclude = [
  'node_modules/**',
  '.next/**',
  'playwright-report/**',
  '__tests__/e2e/**',
];

const common = {
  globals: true,
  clearMocks: true,
  environment: 'node',
};

export default defineConfig(({ mode }) => {
  // Only TEST_SUPABASE_* is forwarded, and only to the `db` project. Loading
  // NEXT_PUBLIC_SUPABASE_* into the unit project would make the mocked suite
  // look like it has a database when it does not.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    resolve: { alias },
    test: {
      projects: [
        {
          plugins: [react()],
          resolve: { alias },
          test: {
            ...common,
            name: 'unit',
            include: ['**/*.test.{ts,tsx}'],
            exclude: [...exclude, '__tests__/db/**'],
            setupFiles: ['./tests/setup.ts'],
            // Coverage lives here rather than at the root: with `projects` the
            // root `test.coverage` block is ignored, and the symptom is a run
            // that says "Coverage enabled with v8" and then writes no report.
            coverage: {
              provider: 'v8',
              reporter: ['text', 'text-summary', 'json', 'html'],
              reportsDirectory: './coverage',
              include: ['src/**/*.ts', 'src/**/*.tsx'],
              exclude: [
                'src/**/*.d.ts',
                'src/**/types/**',
                'src/app/layout.tsx',
                'src/app/globals.css',
              ],
              // Measured, not asserted. Run on 2026-10-03 with 474 tests
              // across 47 files, excluding the two suites #12 still has failing
              // because Vitest writes no coverage report for a failing run:
              //
              //   statements 35.75%   branches 78.16%   functions 83.43%
              //
              // The old config claimed 70% on all four metrics and had never
              // been executed, because @vitest/coverage-v8 was not installed.
              // Statements and lines are dragged down by client components,
              // which have almost no unit coverage -- that is a real gap, not
              // something to threshold away, so these sit just under the
              // measurement as a floor that fails if coverage drops.
              //
              // Re-measure once #12 lands; the excluded files will move it.
              thresholds: {
                statements: 35,
                branches: 75,
                functions: 80,
                lines: 35,
              },
            },
          },
        },
        {
          plugins: [react()],
          resolve: { alias },
          test: {
            ...common,
            name: 'db',
            include: ['__tests__/db/**/*.test.ts'],
            setupFiles: ['./tests/setup.db.ts'],
            // One database, many files. Serialising costs little at this size
            // and removes a whole class of cross-file interference.
            //
            // `fileParallelism` is set here as the intent, but Vitest 3.2.7 does
            // not read it from a project block (same limitation as
            // `environmentMatchGlobs`, see the note above). A single fork is the
            // mechanism this version honors: it runs every db file in one child
            // process, one after another. Without it the paging suites race
            // against a neighbour's inserts and flake.
            pool: 'forks',
            poolOptions: { forks: { singleFork: true } },
            fileParallelism: false,
            env: {
              TEST_SUPABASE_URL: env.TEST_SUPABASE_URL,
              TEST_SUPABASE_ANON_KEY: env.TEST_SUPABASE_ANON_KEY,
              TEST_SUPABASE_SERVICE_ROLE_KEY: env.TEST_SUPABASE_SERVICE_ROLE_KEY,
              TEST_SUPABASE_ALLOW_REMOTE: env.TEST_SUPABASE_ALLOW_REMOTE,
            },
          },
        },
      ],
    },
  };
});