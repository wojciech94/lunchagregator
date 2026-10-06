import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';

// Isolated HTTP Supabase fixture: no database, production credentials or writes.
// Run with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54329 and
// NEXT_PUBLIC_SUPABASE_ANON_KEY=navigation-test-key, --project chromium --workers 1.
// Playwright's standard webServer starts the app with that environment.
const origin = 'http://localhost:3000';
const email = `${'long-admin-email-'.repeat(5)}@example.test`;
const locationLabel = 'Bardzo dluga nazwa lokalizacji we Wroclawiu '.repeat(8);
let backend: Server;

function user(role: string) {
  return { id: '00000000-0000-4000-8000-000000000087', email, aud: 'authenticated',
    role: 'authenticated', app_metadata: { role }, user_metadata: {},
    created_at: '2026-01-01T00:00:00Z' };
}

async function seed(context: BrowserContext, role: string) {
  const cookies = [{ name: 'lunchagregator_location', value: JSON.stringify({
    coordinates: { latitude: 51.1, longitude: 17.03 }, label: locationLabel,
    source: 'manual', savedAt: Date.now(),
  }), url: origin, httpOnly: true }];
  if (role !== 'guest') {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ sub: user(role).id, exp: expires, role })).toString('base64url'),
      'test-signature'].join('.');
    cookies.push({ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify({
      access_token: token, refresh_token: 'test-refresh', expires_at: expires,
      expires_in: 3600, token_type: 'bearer', user: user(role),
    })).toString('base64url')}`, url: origin, httpOnly: true });
  }
  await context.addCookies(cookies);
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
}

test.describe('audit #87 navigation', () => {
  test.skip(process.env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:54329', 'requires the isolated navigation HTTP fixture (see file header)');
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async ({}, info) => {
    if (info.project.name !== 'chromium') return;
    test.setTimeout(120_000);
    backend = createServer((request, response) => {
      response.setHeader('Content-Type', 'application/json');
      if (request.url?.startsWith('/auth/v1/user')) {
        const payload = request.headers.authorization?.split('.')[1];
        const role = payload ? JSON.parse(Buffer.from(payload, 'base64url').toString()).role : 'user';
        response.end(JSON.stringify(user(role)));
      } else if (request.url?.startsWith('/auth/v1/logout')) {
        response.end('{}');
      } else {
        response.end('[]');
      }
    });
    await new Promise<void>((resolve) => backend.listen(54329, '127.0.0.1', resolve));
    await expect.poll(async () => {
      try { return (await fetch(`${origin}/chat`)).status; } catch { return 0; }
    }, { timeout: 90_000 }).toBe(200);
  });
  test.afterAll(async () => {
    if (backend) await new Promise<void>((resolve) => backend.close(() => resolve()));
  });

  for (const role of ['guest', 'user', 'admin']) {
    test(`${role}: links and location fit all audited widths`, async ({ page, context }, info) => {
      test.skip(info.project.name !== 'chromium', 'one isolated fixture app');
      test.setTimeout(90_000);
      await seed(context, role);
      await page.goto(`${origin}/?date=2026-10-08&diets=vegetarian`);
      const header = page.locator('header');
      for (const width of [320, 390, 767, 768, 1000, 1023, 1024, 1279, 1280, 1439, 1440]) {
        await page.setViewportSize({ width, height: 800 });
        if (width < 1440) {
          await header.getByRole('button', { name: 'Otwórz menu' }).click();
        }
        const nav = header.getByRole('navigation', { name: width < 1440 ? 'Nawigacja mobilna' : 'Nawigacja główna' });
        for (const label of ['Oferty', 'Restauracje', 'Dodaj ofertę', 'Czat AI']) {
          await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
        }
        await expect(nav.getByRole('link', { name: 'Oferty', exact: true })).toHaveAttribute('aria-current', 'page');
        if (role === 'guest') {
          for (const [label, route] of [['Zaloguj się', 'login'], ['Zarejestruj się', 'register']]) {
            const link = header.getByRole('link', { name: label });
            await expect(link).toBeVisible();
            await expect(link).toHaveAttribute('href', `/auth/${route}?redirectTo=${encodeURIComponent('/?date=2026-10-08&diets=vegetarian')}`);
          }
        } else {
          await expect(nav.getByRole('link', { name: 'Moje oferty' })).toBeVisible();
          await expect(header.getByRole('button', { name: 'Wyloguj się' })).toBeVisible();
          const account = width < 1440 ? nav : header;
          await expect(account.getByText(email, { exact: true })).toBeVisible();
        }
        await expect(nav.getByRole('link', { name: 'Panel admina' })).toHaveCount(role === 'admin' ? 1 : 0);
        await noOverflow(page);
        const location = header.getByRole('button', { name: locationLabel.trim(), exact: true });
        await location.scrollIntoViewIfNeeded();
        await expect(location).toBeInViewport();
        const box = await location.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        await location.click();
        await expect(header.getByRole('dialog', { name: 'Ustawienia lokalizacji' })).toBeVisible();
        await noOverflow(page);
        await location.click();
        if (width < 1440) await header.getByRole('button', { name: 'Zamknij menu' }).click();
      }
    });
  }

  test('keyboard, outside click, resizing, navigation and logout close the menu', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'chromium', 'one isolated fixture app');
    await seed(context, 'admin');
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`${origin}/chat`);
    const toggle = page.getByRole('button', { name: 'Otwórz menu' });
    const menu = page.getByRole('navigation', { name: 'Nawigacja mobilna' });
    // Confirm hydration via an observable interaction before sending raw keys.
    await toggle.click();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(menu.getByRole('link', { name: 'Oferty', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(toggle).toBeFocused();
    await toggle.click();
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.setViewportSize({ width: 390, height: 800 });
    await expect(menu).toHaveCount(0);
    await toggle.click();
    await menu.getByRole('link', { name: 'Restauracje' }).click();
    await expect(page).toHaveURL(`${origin}/restaurants`);
    await expect(menu).toHaveCount(0);
    await page.goBack();
    await expect(menu).toHaveCount(0);
    await toggle.click();
    await page.locator('main').click({ position: { x: 5, y: 730 } });
    await expect(menu).toHaveCount(0);
    await toggle.click();
    await menu.getByRole('button', { name: 'Wyloguj się' }).click();
    await expect(page).toHaveURL(`${origin}/`);
    await expect(page.locator('header a[href^="/auth/login"]')).toHaveCount(1);
    await expect(menu).toHaveCount(0);
    await toggle.click();
    await expect(menu.getByRole('link', { name: 'Zaloguj się' })).toBeVisible();
  });
});
