import { expect, test } from '@playwright/test';
import { adminClient, runToken, signInIdentity } from '../db/helpers';
import { menuDates, menuToday, menuWeekday } from '../../src/lib/recurring-menu';

test('owner publishes, edits, skips and stops a menu; visitors can browse next Monday', async ({ page }) => {
  const token = runToken('menu-e2e');
  const identity = await signInIdentity(token);
  const admin = adminClient();
  let rid: string | undefined;
  const monday = menuDates(menuToday(),14).find(date => date > menuToday() && menuWeekday(date) === 1)!;
  try {
    const restaurant = await identity.client.from('restaurants').insert({ name: token, address: 'Test street', user_id: identity.id, session_token: token, location: 'POINT(17.03 51.1)' }).select('id').single();
    if (restaurant.error) throw restaurant.error; rid = restaurant.data.id;
    await page.goto('/auth/login?redirectTo=/my-menus');
    await page.getByLabel('Adres e-mail').fill(identity.email);
    await page.getByLabel(/^Hasło/).fill('Password123!');
    await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Moje menu', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Włącz automatyczne powtarzanie' }).click();
    await page.getByRole('button', { name: 'Dodaj danie', exact: true }).click();
    await page.getByLabel('Nazwa dania', { exact: false }).fill(token);
    await page.getByLabel('Cena (PLN)', { exact: false }).fill('25');
    await page.getByRole('button', { name: 'Zapisz danie', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Opublikuj menu', exact: true }).click();
    await expect(page.getByText('Powtarzanie aktywne', { exact: true })).toBeVisible();
    await page.goto(`/?date=${monday}&q=${token}`);
    await expect(page.locator('a[href^="/offers/"]').filter({ hasText: token }).first()).toBeVisible();
    await page.locator('a[href^="/offers/"]').filter({ hasText: token }).first().click();
    await expect(page.getByText('25.00', { exact: false }).first()).toBeVisible();
    const detailUrl = page.url();
    await page.goto('/my-menus');
    await page.getByRole('button', { name: 'Edytuj menu', exact: true }).click();
    await page.getByRole('button', { name: 'Edytuj danie', exact: true }).click();
    await page.getByLabel('Cena (PLN)', { exact: false }).fill('35');
    await page.getByRole('button', { name: 'Zapisz danie', exact: true }).click();
    await page.getByRole('button', { name: 'Opublikuj menu', exact: true }).click();
    await expect(page.getByText('Powtarzanie aktywne', { exact: true })).toBeVisible();
    await page.goto(detailUrl);
    await expect(page.getByText('35.00', { exact: false }).first()).toBeVisible();
    await page.goto('/my-menus');
    await page.getByRole('button', { name: 'Pomiń lub zmień dzień' }).click();
    await page.getByLabel('Wybierz dzień').fill(monday);
    await page.getByRole('button', { name: 'Tego dnia nie ma lunchu' }).click();
    await expect(page.getByRole('button', { name: 'Usuń wyjątek' })).toBeVisible();
    await page.goto(`/restaurants/${rid}?date=${monday}`);
    await expect(page.getByText('Tego dnia nie ma lunchu.', { exact: true })).toBeVisible();
    await page.goto('/my-menus');
    await page.getByRole('button', { name: 'Usuń wyjątek' }).click();
    await expect(page.getByRole('button', { name: 'Usuń wyjątek' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Zatrzymaj powtarzanie', exact: true }).click();
    await expect(page.getByText('Powtarzanie zatrzymane', { exact: true })).toBeVisible();
    await page.goto(detailUrl);
    await expect(page.getByRole('heading', { name: token, exact: true })).toHaveCount(0);
    await page.goto('/my-menus');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    // Delete this run's offers before the restaurant: `restaurant_id` is
    // ON DELETE SET NULL, so the reverse order would orphan ~30 generated
    // occurrences in the shared local database.
    if (rid) {
      await admin.from('lunch_offers').delete().eq('restaurant_id', rid);
      await admin.from('restaurants').delete().eq('id', rid);
    }
    await admin.auth.admin.deleteUser(identity.id);
  }
});
