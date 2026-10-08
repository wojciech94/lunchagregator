import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

// RUN_AI_E2E=1 explicitly opts into launching an isolated app and HTTP fixture.
// The temporary preload redirects Google's endpoint to our local fixture.
// No real API/database, production credentials, or product test backdoors.
const origin = 'http://localhost:3089';
const fixtureUrl = 'http://127.0.0.1:54389';
const user = { id: '00000000-0000-4000-8000-000000000089', email: 'extraction@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const restaurant = { id: '00000000-0000-4000-8000-000000000099', name: 'Pizza Si', address: 'Wojciecha Bogusławskiego 89, Wrocław', cuisine_types: ['wloska'], price_level: 2, lunch_hours_start: null, lunch_hours_end: null };
const inputs = [
  'Restauracja Pizza Si, Wojciecha Bogusławskiego 89, Wrocław. Lunch: zupa pomidorowa i pizza Margherita, 34 PLN, wegetariański, kuchnia włoska. Oferta dostępna 6 października 2026, od 12:00 do 15:00.',
  'Restauracja: Pizza Si. Adres: Wojciecha Bogusławskiego 89, Wrocław. Menu lunchowe: Pizza Margherita + lemoniada. Cena zestawu: 34 zł.',
];
type Mode = 'success' | 'weekly' | 'empty' | 'invalid' | 'rateLimit' | 'unavailable' | 'configuration' | 'timeout';
let mode: Mode = 'success';
let backend: Server;
let writes = 0;
let calls = 0;
let providerText = '';
let app: ChildProcess;
let temporaryDirectory: string;
let startupOutput = '';

function output() {
  const dishes = mode === 'weekly'
    ? ['monday', 'tuesday', 'wednesday'].map((dayOfWeek, index) => ({ name: ['Margherita', 'Penne', 'Risotto'][index], price: 34 + index, dayOfWeek }))
    : [{ name: 'Pizza Margherita + lemoniada', price: 34, items: ['Pizza Margherita', 'lemoniada'] }];
  const value = mode === 'invalid' ? { offers: 'invalid', confidence: 1 }
    : { offers: mode === 'empty' ? [] : [{ restaurantName: 'Pizza Si', address: restaurant.address, dishes }], confidence: 0.9 };
  return { candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(value) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 } };
}

async function seed(context: BrowserContext) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp: expires })).toString('base64url'), 'test-signature'].join('.');
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'test-refresh', expires_at: expires, expires_in: 3600, token_type: 'bearer', user })).toString('base64url')}`, url: origin, httpOnly: true }]);
}

async function analyze(page: Page, text: string) {
  await page.goto(`${origin}/add`);
  await page.getByRole('tab', { name: 'Tekst', exact: true }).click();
  await page.getByRole('textbox', { name: /Wklej tekst/ }).fill(text);
  await page.getByRole('button', { name: 'Analizuj', exact: true }).click();
}

test.describe('audit #89 extraction', () => {
  test.skip(process.env.RUN_AI_E2E !== '1', 'opt in to the isolated extraction fixture with RUN_AI_E2E=1');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    test.setTimeout(120000);
    backend = createServer(async (request, response) => {
      response.setHeader('content-type', 'application/json');
      if (request.url?.startsWith('/gemini/')) {
        calls++;
        let body = '';
        for await (const chunk of request) body += chunk;
        const payload = JSON.parse(body);
        providerText = JSON.stringify(payload.contents);
        const status = mode === 'rateLimit' ? 429 : mode === 'unavailable' ? 503 : mode === 'configuration' ? 400 : 200;
        if (mode === 'timeout') return; // The app must abort this request at its deadline.
        response.statusCode = status;
        response.end(JSON.stringify(status === 200 ? output() : { error: { code: status, message: 'Isolated provider failure', status: 'UNAVAILABLE' } }));
      } else if (request.url?.startsWith('/auth/v1/user')) {
        response.end(JSON.stringify(user));
      } else if (request.url?.startsWith('/rest/v1/restaurants') && request.method === 'GET') {
        response.end(JSON.stringify([restaurant]));
      } else {
        if (request.method !== 'GET') writes++;
        response.end('[]');
      }
    });
    await new Promise<void>(resolve => backend.listen(54389, '127.0.0.1', resolve));
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'lunch-extraction-'));
    const preload = join(temporaryDirectory, 'fetch.cjs');
    writeFileSync(preload, `
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (input, init) => {
        const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
        if (url.hostname === 'generativelanguage.googleapis.com') {
          return originalFetch('${fixtureUrl}/gemini' + url.pathname + url.search, init);
        }
        if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
          throw new Error('External request blocked by extraction fixture');
        }
        return originalFetch(input, init);
      };
    `);
    app = spawn(process.execPath, [join(process.cwd(), 'node_modules/next/dist/bin/next'), 'dev', '-p', '3089'], {
      cwd: process.cwd(), windowsHide: true, stdio: 'pipe',
      env: { ...process.env, NODE_OPTIONS: `--require "${preload.replaceAll('\\', '/')}"`, NEXT_PUBLIC_SUPABASE_URL: fixtureUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'extraction-test-key', GOOGLE_GENERATIVE_AI_API_KEY: 'extraction-test-key', AI_MODEL: 'gemini-3.5-flash-lite', AI_FALLBACK_MODEL: 'gemini-3.1-flash-lite' },
    });
    app.stdout?.on('data', chunk => { startupOutput = (startupOutput + chunk).slice(-6000); });
    app.stderr?.on('data', chunk => { startupOutput = (startupOutput + chunk).slice(-6000); });
    await expect.poll(async () => {
      if (app.exitCode !== null) throw new Error(`Isolated app exited: ${startupOutput}`);
      try { return (await fetch(`${origin}/auth/login`)).status; } catch { return 0; }
    }, { timeout: 90000 }).toBe(200);
  });
  test.afterAll(async () => {
    if (app?.pid) {
      if (process.platform === 'win32') {
        try { execFileSync('taskkill', ['/pid', String(app.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true }); } catch { /* Already exited. */ }
      } else app.kill('SIGTERM');
    }
    if (backend) {
      backend.closeAllConnections();
      await new Promise<void>(resolve => backend.close(() => resolve()));
    }
    if (temporaryDirectory && dirname(resolve(temporaryDirectory)) === resolve(tmpdir())) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
  test.beforeEach(async ({ context }) => {
    mode = 'success'; calls = 0; writes = 0; providerText = '';
    await seed(context);
  });
  test.afterEach(() => expect(writes).toBe(0));

  for (const [index, input] of inputs.entries()) {
    test(`reported text ${index + 1} reaches assignment, preview and editor`, async ({ page }) => {
      await analyze(page, input);
      await expect(page.getByRole('button', { name: 'To jest ta restauracja' })).toBeVisible();
      expect(providerText).toContain(input);
      await page.getByRole('button', { name: 'To jest ta restauracja' }).click();
      await expect(page.getByText('Pizza Margherita + lemoniada', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Edytuj i potwierdź' }).click();
      await expect(page.locator('input[name="dishName"]')).toHaveValue('Pizza Margherita + lemoniada');
      await expect(page.locator('input[name="price"]')).toHaveValue('34');
      expect(calls).toBe(1);
    });
  }

  test('weekly menu reaches a preview with distinct days', async ({ page }) => {
    mode = 'weekly';
    await analyze(page, 'Pizza Si. Poniedziałek: Margherita 34 zł. Wtorek: Penne 35 zł. Środa: Risotto 36 zł.');
    await page.getByRole('button', { name: 'To jest ta restauracja' }).click();
    await expect(page.getByRole('heading', { name: 'Menu tygodniowe' })).toBeVisible();
    for (const day of ['Poniedziałek', 'Wtorek', 'Środa']) await expect(page.getByText(day, { exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(6);
    await page.getByRole('textbox', { name: 'Nazwa dania', exact: true }).first().fill('Poprawiona Margherita');
    await page.getByRole('spinbutton', { name: 'Cena (PLN)' }).first().fill('39.50');
    await page.getByRole('textbox', { name: 'Skład zestawu (jeden składnik w wierszu)' }).first().fill('Pizza, duża\nLemoniada');
    await page.getByRole('checkbox', { name: 'Publikuj ofertę 2' }).uncheck();
    await expect(page.getByRole('button', { name: 'Opublikuj 2 oferty', exact: true })).toBeEnabled();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('spinbutton', { name: 'Cena (PLN)' }).first().fill('');
    await expect(page.getByRole('button', { name: 'Opublikuj 2 oferty', exact: true })).toBeDisabled();
    await page.getByRole('spinbutton', { name: 'Cena (PLN)' }).first().fill('39.50');
    await expect(page.getByRole('button', { name: 'Opublikuj 2 oferty', exact: true })).toBeEnabled();
  });

  for (const [failure, message] of [
    ['rateLimit', 'AI jest chwilowo zajęty'],
    ['unavailable', 'Usługa analizy AI jest chwilowo niedostępna'],
    ['configuration', 'Usługa analizy AI nie jest poprawnie skonfigurowana'],
    ['invalid', 'AI zwróciło nieprawidłowe dane oferty'],
    ['timeout', 'Analiza AI trwała zbyt długo'],
    ['empty', 'Nie udało się wyekstrahować żadnych ofert'],
  ] as const) {
    test(`${failure} preserves text and supports retry/manual fallback`, async ({ page }) => {
      mode = failure;
      await analyze(page, inputs[1]);
      const alert = page.getByRole('alert').filter({ hasText: message });
      await expect(alert).toBeVisible({ timeout: 30000 });
      await expect(page.getByRole('tab', { name: 'Tekst' })).toHaveAttribute('data-state', 'active');
      await expect(page.getByRole('textbox', { name: /Wklej tekst/ })).toHaveValue(inputs[1]);
      expect(calls).toBe(failure === 'rateLimit' ? 2 : 1);
      if (failure !== 'empty') await expect(alert).not.toContainText('Nie udało się wyekstrahować');
      // Retry the same input without repasting it.
      mode = 'success';
      await page.getByRole('button', { name: 'Analizuj', exact: true }).click();
      await expect(page.getByRole('button', { name: 'To jest ta restauracja' })).toBeVisible();
      await page.getByRole('button', { name: 'Wróć do wprowadzania danych' }).click();
      await expect(page.getByRole('textbox', { name: /Wklej tekst/ })).toHaveValue(inputs[1]);
      mode = failure;
      await page.getByRole('button', { name: 'Analizuj', exact: true }).click();
      await expect(alert).toBeVisible({ timeout: 30000 });
      await page.getByRole('button', { name: 'Wprowadź dane ręcznie', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Przypisz restaurację' })).toBeVisible();
      await page.getByRole('button', { name: 'Wróć do wprowadzania danych' }).click();
      await expect(page.getByRole('textbox', { name: /Wklej tekst/ })).toHaveValue(inputs[1]);
    });
  }
});
