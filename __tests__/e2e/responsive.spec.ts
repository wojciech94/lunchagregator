import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  measureFontSizes,
  measureHorizontalOverflow,
  measureTapTargets,
  measureTargetSpacing,
  normalise,
} from './helpers/requirement7';

/**
 * Requirement 7 measurement. Runs on the five viewport projects and nowhere
 * else -- the four browser projects are covered by browser-smoke.spec.ts.
 *
 * Deliberately NOT gated behind PLAYWRIGHT_SUPABASE_TEST_ENABLED. This suite
 * opens no socket and creates nothing, which is the point of checking layout
 * without a database. Gating it is why it would otherwise skip in normal
 * development.
 *
 * ## Why this compares against a baseline instead of asserting zero
 *
 * A first run measures a large number of real violations, catalogued in #23:
 * 44 tap-target findings, most body text below 16px, nav links 4px apart. The
 * shared primitives (`ui/input.tsx` `h-9`, `ui/select.tsx` `h-9`,
 * `ui/button.tsx` `size.default h-9`) account for over 30 of the tap-target
 * findings, so most are one-line fixes -- but they touch components another
 * effort is editing.
 *
 * Asserting zero would deliver a permanently red suite, which trains everyone to
 * ignore it. This fails only on findings the baseline does not already account
 * for: green today, red the moment something regresses or someone adds a new
 * violation while fixing old ones.
 *
 * The baseline is the debt, written down. Deleting an entry is the visible act
 * of fixing that violation.
 *
 * ## Re-recording
 *
 *   RECORD_REQUIREMENT7=1 npm run test:e2e -- --workers=1 __tests__/e2e/responsive.spec.ts
 *
 * `--workers=1` is required, not advisory. Each worker holds its own partial
 * copy and merges into the file at the end, but read-modify-write is not atomic:
 * two workers finishing together both read the same old file and the second
 * silently discards the first's keys. That produced a baseline missing one of
 * twenty-five entries while the recording run reported every test as passed --
 * the loss was only visible when the next verification run failed on it.
 *
 * Review the diff before committing it. A baseline that grows silently is a
 * way to make a regression permanent.
 *
 * ## Known blind spot
 *
 * The overflow probe deliberately ignores elements inside a horizontally
 * scrollable ancestor, because such a region is a design choice rather than a
 * page-level overflow. That is right for the intent of 7.1, but it means the
 * day-selector strip is invisible here: #23 measured four of its seven filters
 * to be unreachable at 320px without a deliberate swipe. Nothing in this suite
 * catches that, and 7.1 should not be read as covering it.
 */

const VIEWPORT_PROJECTS = new Set([
  'mobile-320',
  'tablet-768',
  'desktop-1024',
  'desktop-1440',
  'ultrawide-2560',
]);

const NARROW_PROJECTS = new Set(['mobile-320', 'tablet-768']);

/** Reachable without a session. The auth matcher 307s everything else to login. */
const ROUTES = ['/', '/restaurants', '/chat', '/auth/login', '/auth/register'];

type Bucket = 'overflow' | 'tapTargets' | 'spacing' | 'fontSizes' | 'axe';

interface Baseline {
  overflow: Record<string, string[]>;
  tapTargets: Record<string, string[]>;
  spacing: Record<string, string[]>;
  fontSizes: Record<string, string[]>;
  axe: Record<string, string[]>;
}

const BASELINE_PATH = resolve(__dirname, 'baselines', 'requirement7.json');
const RECORDING = process.env.RECORD_REQUIREMENT7 === '1';

function emptyBaseline(): Baseline {
  return { overflow: {}, tapTargets: {}, spacing: {}, fontSizes: {}, axe: {} };
}

function loadBaseline(): Baseline {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
  } catch {
    return emptyBaseline();
  }
}

let baseline = loadBaseline();

test.afterAll(() => {
  if (!RECORDING) return;

  // Merge rather than overwrite. Playwright runs this file across several
  // workers, each with its own module instance and therefore its own partial
  // `baseline`. Writing the whole thing per worker loses every key but the last
  // one -- which is exactly what the first recording attempt produced.
  let existing = emptyBaseline();
  try {
    existing = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
  } catch {
    // No baseline yet.
  }

  const merged: Baseline = {
    overflow: { ...existing.overflow, ...baseline.overflow },
    tapTargets: { ...existing.tapTargets, ...baseline.tapTargets },
    spacing: { ...existing.spacing, ...baseline.spacing },
    fontSizes: { ...existing.fontSizes, ...baseline.fontSizes },
    axe: { ...existing.axe, ...baseline.axe },
  };

  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  writeFileSync(BASELINE_PATH, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
});

/** New findings are the ones the baseline does not already account for. */
function regressions(measured: string[], known: string[]): string[] {
  const knownSet = new Set(known);
  return measured.filter((selector) => !knownSet.has(selector));
}

const AXE_SOURCE = readFileSync(
  resolve(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'),
  'utf8'
);

async function runAxe(page: Page): Promise<string[]> {
  await page.addScriptTag({ content: AXE_SOURCE });
  return page.evaluate(async () => {
    const axe = (
      globalThis as unknown as {
        axe: {
          run: (
            ctx: unknown,
            opts: unknown
          ) => Promise<{ violations: { id: string; nodes: unknown[] }[] }>;
        };
      }
    ).axe;
    const run = await axe.run(document, { resultTypes: ['violations'] });
    return run.violations.map((v) => `${v.id} x${v.nodes.length}`);
  });
}

/** Records into the baseline when recording, otherwise asserts no regressions. */
function check(bucket: Bucket, key: string, measured: string[]): void {
  if (RECORDING) {
    baseline[bucket][key] = measured;
    return;
  }
  const known = baseline[bucket][key] ?? [];
  expect(
    regressions(measured, known),
    `new ${bucket} at ${key}. Already recorded: ${known.join(', ') || 'none'}`
  ).toEqual([]);
}

test.describe('Requirement 7', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(20_000);
  });

  for (const route of ROUTES) {
    test(`${route} keeps content inside the viewport`, async ({ page }, testInfo) => {
      test.skip(
        !VIEWPORT_PROJECTS.has(testInfo.project.name),
        'viewport measurement runs on the responsive projects only'
      );

      await page.goto(route, { waitUntil: 'domcontentloaded' });

      check('overflow', `${testInfo.project.name} ${route}`, normalise(await measureHorizontalOverflow(page)));
    });

    test(`${route} has no interactive element below 44x44`, async ({
      page,
    }, testInfo) => {
      test.skip(!NARROW_PROJECTS.has(testInfo.project.name), '7.3 applies at 768px and below');

      await page.goto(route, { waitUntil: 'domcontentloaded' });

      check('tapTargets', `${testInfo.project.name} ${route}`, normalise(await measureTapTargets(page)));
    });

    test(`${route} keeps tap targets at least 8px apart`, async ({ page }, testInfo) => {
      test.skip(!NARROW_PROJECTS.has(testInfo.project.name), '7.3 applies at 768px and below');

      await page.goto(route, { waitUntil: 'domcontentloaded' });

      check('spacing', `${testInfo.project.name} ${route}`, normalise(await measureTargetSpacing(page)));
    });

    test(`${route} renders body text at 16px or larger`, async ({ page }, testInfo) => {
      test.skip(!NARROW_PROJECTS.has(testInfo.project.name), '7.4 applies at 768px and below');

      await page.goto(route, { waitUntil: 'domcontentloaded' });

      check('fontSizes', `${testInfo.project.name} ${route}`, normalise(await measureFontSizes(page)));
    });

    test(`${route} has no new axe-core violations`, async ({ page }, testInfo) => {
      test.skip(
        !VIEWPORT_PROJECTS.has(testInfo.project.name),
        'viewport measurement runs on the responsive projects only'
      );

      await page.goto(route, { waitUntil: 'domcontentloaded' });

      check('axe', `${testInfo.project.name} ${route}`, (await runAxe(page)).sort());
    });
  }
});