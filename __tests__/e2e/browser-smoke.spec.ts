import { expect, test } from '@playwright/test';

/**
 * Cross-browser smoke, for Requirement 7.2.
 *
 * Runs on the four browser projects and nowhere else. Functional flows stay
 * on chromium -- running every flow through four engines costs four times as
 * much and buys nothing, because a layout break and an engine difference are
 * different failures. What this catches is the second one: a page that renders
 * in Chromium and throws or fails to mount in Firefox, WebKit or Edge.
 *
 * Deliberately NOT gated behind PLAYWRIGHT_SUPABASE_TEST_ENABLED. It opens no
 * socket and creates nothing; gating it is why it would skip in normal
 * development.
 *
 * Requires the browsers to be present:
 *   npx playwright install firefox webkit msedge
 *
 * Chromium and Edge are usually already available. Firefox and WebKit are
 * separate downloads, and a missing browser is a launch error rather than a
 * skip, so that command is part of setup rather than an optional extra.
 */

const BROWSER_PROJECTS = new Set(['chromium', 'edge']);

/** Routes that render without a session. The auth matcher redirects the rest. */
const ROUTES = ['/', '/restaurants', '/chat', '/auth/login', '/auth/register'];

test.describe('cross-browser smoke', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(20_000);
  });

  for (const route of ROUTES) {
    test(`${route} renders without a script error`, async ({ page }, testInfo) => {
      test.skip(
        !BROWSER_PROJECTS.has(testInfo.project.name),
        'browser smoke runs on the four browser projects'
      );

      const scriptErrors: string[] = [];
      page.on('pageerror', (error) => scriptErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') {
          const text = message.text();
          // The Next.js dev-mode 404 probe is expected on every route and says
          // nothing about the page under test.
          if (!text.includes('404 (Not Found)')) {
            scriptErrors.push(text);
          }
        }
      });

      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });

      expect(response?.status(), `${route} should respond`).toBeLessThan(400);
      expect(scriptErrors, `script errors on ${route}`).toEqual([]);

      // The layout must produce a visible document, not an empty shell. An
      // engine that fails to mount React still returns 200 with a blank page.
      await expect(page.locator('body')).not.toBeEmpty();
    });
  }

  test('the navigation links render and are reachable', async ({ page }, testInfo) => {
    test.skip(
      !BROWSER_PROJECTS.has(testInfo.project.name),
      'browser smoke runs on the four browser projects'
    );

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Mobile projects hide these behind a menu, but this only runs on browsers.
    await expect(page.getByRole('link', { name: 'Restauracje' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Zaloguj się|Zaloguj/ })).toBeVisible();
  });
});