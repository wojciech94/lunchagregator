import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';

// Local PostGIS integration, including real Next actions. Run a fresh app with
// local NEXT_PUBLIC_SUPABASE_* and E2E_APP_URL pointing at that app. No remote writes.
const env = { ...loadEnv('test', process.cwd(), ''), ...process.env };
const appUrl = env.E2E_APP_URL ?? 'http://localhost:3000';
const enabled = env.NEXT_PUBLIC_SUPABASE_URL === 'http://127.0.0.1:54321'
  && env.TEST_SUPABASE_URL === env.NEXT_PUBLIC_SUPABASE_URL;
test.describe('audit #91 linked offer data', () => {
  test.skip(!enabled, 'requires the local Supabase stack and a local app');
  test.describe.configure({ mode: 'serial' });
  test('publication, filters and renewal retain cuisine and the correct branch snapshot', async ({ page, context }) => {
    test.setTimeout(120_000);
    expect(new URL(appUrl).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
    const admin = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const client = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const token = `e2e-linked-${Date.now()}`;
    let userId: string | undefined;
    let restaurantId: string | undefined;
    try {
      const account = await admin.auth.admin.createUser({ email: `${token}@example.test`, password: 'Password123!', email_confirm: true });
      if (account.error) throw account.error;
      userId = account.data.user.id;
      const signed = await client.auth.signInWithPassword({ email: `${token}@example.test`, password: 'Password123!' });
      if (signed.error) throw signed.error;
      await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(signed.data.session)).toString('base64url')}`, url: appUrl, httpOnly: true },
        { name: 'lunchagregator_location', value: JSON.stringify({ coordinates: { latitude: 51.1, longitude: 17.03 }, label: 'Local fixture', source: 'manual', savedAt: Date.now() }), url: appUrl, httpOnly: true }]);
      const branch = await client.from('restaurants').insert({ name: token, address: 'Original branch address', location: 'POINT(17.03 51.1)', cuisine_types: ['wloska'], user_id: userId }).select('id').single();
      if (branch.error) throw branch.error;
      restaurantId = branch.data.id;
      await page.goto(`${appUrl}/add`);
      await page.getByRole('tab', { name: 'Tekst' }).click();
      await page.getByPlaceholder('Wklej tutaj treść menu lub oferty lunchowej...').fill('Pizza 25 PLN');
      await page.getByRole('button', { name: 'Analizuj', exact: true }).click();
      // No AI key is needed: exercise the existing manual fallback.
      await page.getByRole('button', { name: 'Wprowadź dane ręcznie' }).click();
      await page.getByRole('combobox').fill(token);
      await page.getByRole('option', { name: new RegExp(token) }).click();
      await page.getByLabel('Nazwa dania').fill(`${token}-pizza`);
      await page.getByLabel('Cena (PLN)').fill('25');
      await page.getByRole('button', { name: 'Opublikuj ofertę' }).click();
      await expect.poll(async () => (await client.from('lunch_offers').select('id').eq('user_id', userId!).eq('dish_name', `${token}-pizza`)).data?.length).toBe(1);
      const saved = await client.from('lunch_offers').select('*').eq('user_id', userId).eq('dish_name', `${token}-pizza`).single();
      expect(saved.error).toBeNull();
      expect(saved.data).toMatchObject({ restaurant_id: restaurantId, restaurant_name: token, restaurant_address: 'Original branch address', cuisine_type: 'wloska' });
      expect(saved.data.restaurant_location).toBeTruthy();
      await page.goto(`${appUrl}/?date=${saved.data.available_date}&cuisines=wloska&radius=1&search=${token}`);
      await expect(page.getByRole('link', { name: new RegExp(`${token}-pizza`) }).first()).toBeVisible();

      // Preserve a dish override through the actual renewal action while the
      // restaurant moves. Neither editing nor renewal changes the source row.
      const yesterday = new Date(); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const override = await client.from('lunch_offers').update({ cuisine_type: 'polska', available_date: yesterday.toISOString().slice(0, 10) }).eq('id', saved.data.id);
      expect(override.error).toBeNull();
      // An unknown source cuisine must stay unknown even when this branch's
      // current cuisine would supply a default for a new publication.
      const unknown = await client.from('lunch_offers').insert({ dish_name: `${token}-unknown`, price: 25, restaurant_id: restaurantId, restaurant_name: token, restaurant_address: saved.data.restaurant_address, restaurant_location: saved.data.restaurant_location, cuisine_type: null, available_date: saved.data.available_date, source_type: 'text', user_id: userId }).select('id').single();
      if (unknown.error) throw unknown.error;
      const expireUnknown = await client.from('lunch_offers').update({ available_date: yesterday.toISOString().slice(0, 10) }).eq('id', unknown.data.id);
      expect(expireUnknown.error).toBeNull();
      const moved = await client.from('restaurants').update({ name: `${token}-moved`, address: 'New branch address', location: 'POINT(17.04 51.11)' }).eq('id', restaurantId);
      expect(moved.error).toBeNull();
      await page.goto(`${appUrl}/offers/${saved.data.id}`);
      await expect(page.getByText('Original branch address', { exact: true })).toBeVisible();
      await page.goto(`${appUrl}/my-offers?tab=expired`);
      await page.getByRole('button', { name: 'Wznów na kolejny tydzień' }).click();
      await expect.poll(async () => (await client.from('lunch_offers').select('id').eq('restaurant_id', restaurantId!)).data?.length).toBe(4);
      const renewed = await client.from('lunch_offers').select('*').eq('restaurant_id', restaurantId).eq('dish_name', saved.data.dish_name).neq('id', saved.data.id).single();
      expect(renewed.error).toBeNull();
      expect(renewed.data).toMatchObject({ cuisine_type: 'polska', restaurant_name: `${token}-moved`, restaurant_address: 'New branch address' });
      expect(renewed.data.restaurant_location).not.toBe(saved.data.restaurant_location);
      const renewedUnknown = await client.from('lunch_offers').select('*').eq('restaurant_id', restaurantId).eq('dish_name', `${token}-unknown`).neq('id', unknown.data.id).single();
      expect(renewedUnknown.error).toBeNull();
      expect(renewedUnknown.data).toMatchObject({ cuisine_type: null, restaurant_address: 'New branch address', restaurant_location: renewed.data.restaurant_location });
      const original = await client.from('lunch_offers').select('*').eq('id', saved.data.id).single();
      expect(original.data).toMatchObject({ restaurant_name: token, restaurant_address: 'Original branch address', restaurant_location: saved.data.restaurant_location, cuisine_type: 'polska' });
    } finally {
      if (userId) await admin.from('lunch_offers').delete().eq('user_id', userId);
      if (restaurantId) await admin.from('restaurants').delete().eq('id', restaurantId);
      if (userId) await admin.auth.admin.deleteUser(userId);
    }
  });
});
