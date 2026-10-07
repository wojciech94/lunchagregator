import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * This suite performs real Supabase Auth operations and deliberately triggers a
 * per-email login rate limit. Run it only against a disposable Supabase project:
 *
 *   $env:PLAYWRIGHT_SUPABASE_TEST_ENABLED='true'; npm run test:e2e -- --project=chromium __tests__/e2e/auth.spec.ts
 *
 * NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must point to that
 * test project, with email confirmation disabled and the 5-failure/15-minute
 * login limit configured. The explicit opt-in prevents account creation or
 * rate-limit traffic against an unverified environment.
 */
const runAgainstSupabaseTestEnvironment =
  process.env.PLAYWRIGHT_SUPABASE_TEST_ENABLED === 'true';
const testRunId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const testEmail = `playwright-auth-${testRunId}@example.test`;
const testPassword = `Playwright-${testRunId}-secure`;
const invalidPassword = 'incorrect-password';

async function fillCredentials(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
}

async function expectAuthenticatedSessionCookie(
  context: BrowserContext
): Promise<void> {
  const authCookies = (await context.cookies()).filter(
    (cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token')
  );

  expect(authCookies, 'Supabase should issue an auth-token cookie').not.toHaveLength(
    0
  );
  for (const cookie of authCookies) {
    expect(cookie.value).not.toBe('');
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
  }
}

async function expectNoAuthenticatedSessionCookie(
  context: BrowserContext
): Promise<void> {
  const authCookies = (await context.cookies()).filter(
    (cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token')
  );

  expect(authCookies).toHaveLength(0);
}

test.describe('Supabase authentication journeys', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      !runAgainstSupabaseTestEnvironment,
      'Requires an explicitly enabled disposable Supabase test environment.'
    );
    test.skip(
      testInfo.project.name !== 'chromium',
      'Runs once in Chromium to avoid duplicating rate-limit traffic across projects.'
    );
  });

  test('registers, redirects home, renders authenticated navigation, and issues a session cookie', async ({
    page,
    context,
  }) => {
    await page.goto('/auth/register');
    await expect(page.getByRole('heading', { name: 'Utwórz konto' })).toBeVisible();

    await fillCredentials(page, testEmail, testPassword);
    await page.getByRole('button', { name: 'Zarejestruj się', exact: true }).click();

    await page.waitForURL('/');
    await expect(page.getByText(testEmail, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Menu profilu' }).click();
    await expect(
      page.getByRole('button', { name: 'Wyloguj się', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Zaloguj się', exact: true })
    ).toHaveCount(0);
    await expectAuthenticatedSessionCookie(context);
  });

  test('logs in, logs out, clears the session cookie, and restores guest navigation', async ({
    page,
    context,
  }) => {
    await page.goto('/auth/login');
    await fillCredentials(page, testEmail, testPassword);
    await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();

    await page.waitForURL('/');
    await expect(page.getByText(testEmail, { exact: true })).toBeVisible();
    await expectAuthenticatedSessionCookie(context);

    await page.getByRole('button', { name: 'Menu profilu' }).click();
    await page.getByRole('button', { name: 'Wyloguj się', exact: true }).click();
    await page.waitForURL('/');
    await expect(
      page.getByRole('link', { name: 'Zaloguj się', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Zarejestruj się', exact: true })
    ).toBeVisible();
    await expect(page.getByText(testEmail, { exact: true })).toHaveCount(0);
    await expectNoAuthenticatedSessionCookie(context);
  });

  test('returns a guest from a protected route after login', async ({ page }) => {
    await page.goto('/restaurants/new');
    await page.waitForURL('/auth/login?redirectTo=%2Frestaurants%2Fnew');

    await fillCredentials(page, testEmail, testPassword);
    await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();

    await page.waitForURL('/restaurants/new');
    await expect(page.getByText(testEmail, { exact: true })).toBeVisible();
  });

  test('shows the Auth-service rate-limit message after five invalid login attempts', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto('/auth/login');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await fillCredentials(page, testEmail, invalidPassword);
      await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
      await expect(
        page.getByRole('alert', {
          name: 'Nieprawidłowy adres e-mail lub hasło',
        })
      ).toBeVisible();
    }

    await fillCredentials(page, testEmail, invalidPassword);
    await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
    await expect(
      page.getByRole('alert', {
        name: 'Zbyt wiele nieudanych prób. Spróbuj ponownie za 15 minut.',
      })
    ).toBeVisible();
  });
});
