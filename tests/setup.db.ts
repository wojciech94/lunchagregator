/**
 * Setup for the `db` Vitest project.
 *
 * Deliberately mocks nothing. `tests/setup.ts` replaces `@supabase/ssr` and
 * `next/headers` for every file it loads, which is correct for unit tests and
 * fatal for these: a suite whose Supabase client is a hand-built chainable
 * object cannot tell a working query from a plausible one.
 *
 * Consequence to keep in mind: nothing here touches `next/headers`, so
 * `src/lib/supabase/server.ts` cannot be used from this project. These tests
 * talk to PostgREST and to SQL directly with `@supabase/supabase-js`, which is
 * the layer that was previously unverifiable. Testing the Next.js server layer
 * belongs to Playwright, where a real request context exists.
 */
import '../__tests__/properties/fc-config';

const REQUIRED = [
  'TEST_SUPABASE_URL',
  'TEST_SUPABASE_ANON_KEY',
  'TEST_SUPABASE_SERVICE_ROLE_KEY',
] as const;

const missing = REQUIRED.filter((name) => !process.env[name]);

if (missing.length > 0) {
  throw new Error(
    [
      `The db project needs ${missing.join(', ')}.`,
      '',
      'Start the local stack and read the values out of it:',
      '',
      '  npx supabase start',
      '  npx supabase status -o env',
      '',
      'Then put them in .env.local:',
      '',
      '  TEST_SUPABASE_URL=http://127.0.0.1:54321',
      '  TEST_SUPABASE_ANON_KEY=<ANON_KEY from the command above>',
      '  TEST_SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from the command above>',
      '',
      'See docs/agents/test-database.md.',
    ].join('\n'),
  );
}

/**
 * These suites insert and delete rows. A run pointed at a real project would
 * remove whatever its token prefix matched, so a non-local host has to be
 * asked for explicitly.
 *
 * The guard above proves at runtime that all three variables are set, but it
 * checks names while this code reads values, so the compiler cannot see the
 * connection and still types the read as `string | undefined`. `requireEnv`
 * is how the narrowing happens; its own throw is unreachable while the guard
 * above is in place, and stays as the guarantee if the guard is ever removed.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}.`);
  }
  return value;
}

const host = new URL(requireEnv('TEST_SUPABASE_URL')).hostname;
const isLocal = host === '127.0.0.1' || host === 'localhost' || host === '::1';

if (!isLocal && process.env.TEST_SUPABASE_ALLOW_REMOTE !== 'true') {
  throw new Error(
    [
      `Refusing to run DB tests against ${host}, which is not the local stack.`,
      '',
      'These tests write and delete rows. If that is genuinely a throwaway',
      'database, set TEST_SUPABASE_ALLOW_REMOTE=true and say so in the commit.',
    ].join('\n'),
  );
}