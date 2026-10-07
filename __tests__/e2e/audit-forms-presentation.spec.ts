import { expect, test } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { todayISO } from '../../src/utils/day-of-week';

// Run against a fresh local app with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54339
// and NEXT_PUBLIC_SUPABASE_ANON_KEY=forms-test-key, --project chromium --workers 1.
// All reads/writes below use this in-memory HTTP fixture, never a real database.
const owner = '00000000-0000-4000-8000-000000000090';
const offerId = '00000000-0000-4000-8000-000000000091';
const restaurantId = '00000000-0000-4000-8000-000000000092';
const originalItems = ['Pizza Margherita', 'Napój (kawa, oranżada lub woda)', 'Deser "dnia", owoce'];
const actor = { id: owner, email: 'forms@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const baseOffer = {
  id: offerId, dish_name: 'Pizza Margherita', items: originalItems, price: 34, currency: 'PLN', description: 'Lunch',
  restaurant_id: restaurantId, restaurant_name: 'Pizza Si', restaurant_address: 'Wrocław', restaurant_location: null,
  available_date: todayISO(), cuisine_type: 'wloska', dietary_tags: ['vegetarian'], allergens: ['mleko'],
  source_type: 'text', user_id: owner, session_token: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};
const baseRestaurant = {
  id: restaurantId, name: 'Pizza Si', description: 'Restauracja', address: 'Wrocław', location: null,
  price_level: 'średnia', lunch_hours_start: '12:00:00', lunch_hours_end: '15:00:00', cuisine_types: ['wloska'],
  phone_number: null, website_url: null, session_token: null, user_id: owner, menu_recurs_weekly: true,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};
let offer = { ...baseOffer };
let restaurant = { ...baseRestaurant };
let backend: Server;
let writes: { table: string; data: Record<string, unknown> }[];

test.describe('audit #90 forms and presentation', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(process.env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:54339', 'requires the isolated forms HTTP fixture (see file header)');
  test.beforeAll(async ({}, info) => {
    if (info.project.name !== 'chromium') return;
    backend = createServer(async (request, response) => {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      const url = new URL(request.url ?? '/', 'http://fixture.test');
      if (url.pathname === '/auth/v1/user') { response.end(JSON.stringify(actor)); return; }
      const table = url.pathname.split('/').at(-1)!;
      if (table !== 'lunch_offers' && table !== 'restaurants') {
        response.statusCode = 400; response.end(JSON.stringify({ message: 'Unexpected fixture endpoint' })); return;
      }
      if (request.method === 'PATCH') {
        let body = '';
        for await (const chunk of request) body += chunk;
        const data = JSON.parse(body);
        writes.push({ table, data });
        if (table === 'lunch_offers') offer = { ...offer, ...data };
        else restaurant = { ...restaurant, ...data };
      } else if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.statusCode = 405; response.end('{}'); return;
      }
      response.setHeader('Content-Range', '0-0/1');
      if (request.method === 'HEAD') { response.end(); return; }
      let row = table === 'lunch_offers' ? offer : restaurant;
      // The expired-tab fixture keeps counts deterministic without renewing anything.
      if (table === 'lunch_offers' && url.searchParams.get('available_date')?.startsWith('lt.')) {
        row = { ...offer, available_date: '2020-01-01' };
      }
      response.end(JSON.stringify(request.headers.accept?.includes('object+json') ? row : [row]));
    });
    await new Promise<void>((resolve) => backend.listen(54339, '127.0.0.1', resolve));
  });
  test.afterAll(async () => {
    if (backend) await new Promise<void>((resolve) => backend.close(() => resolve()));
  });
  test.beforeEach(async ({ context }, info) => {
    test.setTimeout(90_000);
    test.skip(info.project.name !== 'chromium', 'one isolated HTTP fixture');
    offer = { ...baseOffer }; restaurant = { ...baseRestaurant }; writes = [];
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: owner, exp: expires })).toString('base64url'), 'fixture-signature'].join('.');
    await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_at: expires, expires_in: 3600, user: actor })).toString('base64url')}`, url: 'http://localhost:3000', httpOnly: true }]);
  });

  for (const width of [320, 1280]) {
    test(`offer edit preserves items and shows localized errors/details at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/offers/${offerId}/edit`);
      await expect(page.getByLabel('Pozycja zestawu 2')).toHaveValue(originalItems[1]);
      await page.getByLabel(/Opis/).fill('Nowy opis');
      await page.getByLabel(/Cena/).fill('');
      await page.getByRole('button', { name: 'Zapisz zmiany' }).click();
      await expect(page.getByLabel(/Cena/)).toHaveAccessibleDescription('Podaj cenę w PLN.');
      expect(writes).toEqual([]);
      await page.getByLabel(/Cena/).fill('34');
      await page.getByRole('button', { name: 'Zapisz zmiany' }).click();
      await expect(page).toHaveURL(new RegExp(`/offers/${offerId}$`), { timeout: 30_000 });
      expect(writes[0].data.items).toEqual(originalItems);
      await expect(page.getByRole('heading', { level: 1, name: 'Pizza Margherita' })).toBeVisible();
      await expect(page.getByText('Włoska', { exact: true })).toBeVisible();
      await expect(page.getByText('Wegetariańskie', { exact: true })).toBeVisible();
      await expect(page.getByText('Mleko', { exact: true })).toBeVisible();
      await expect(page.getByText(originalItems[1], { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });

    test(`restaurant edit retains hours; creation explains location at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/restaurants/${restaurantId}/edit`);
      await expect(page.getByLabel('Od', { exact: true })).toHaveValue('12:00');
      await expect(page.getByLabel('Do', { exact: true })).toHaveValue('15:00');
      await page.getByLabel(/Opis/).fill('Nowy opis restauracji');
      await page.getByRole('button', { name: 'Zapisz zmiany' }).click();
      await expect(page).toHaveURL(new RegExp(`/restaurants/${restaurantId}$`), { timeout: 30_000 });
      expect(writes[0].data).toMatchObject({ lunch_hours_start: '12:00', lunch_hours_end: '15:00', description: 'Nowy opis restauracji' });
      await expect(page.getByText('12:00 - 15:00', { exact: true })).toBeVisible();
      await expect(page.getByText('Włoska', { exact: true })).toBeVisible();
      await page.goto('/restaurants/new');
      await page.getByLabel(/Nazwa restauracji/).fill('Nowa restauracja');
      await page.getByRole('button', { name: 'Dodaj restaurację' }).click();
      await expect(page.getByLabel(/^Adres/)).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByLabel(/^Adres/)).toHaveAccessibleDescription(/Wymagany jest adres/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect(writes).toHaveLength(1);
    });
  }
  test('expired group uses nominative count and shows the weekly badge once', async ({ page }) => {
    await page.goto('/my-offers?tab=expired');
    await expect(page.getByText('1 oferta', { exact: true })).toBeVisible();
    await expect(page.getByText('menu tygodniowe', { exact: true })).toHaveCount(1);
  });
});
