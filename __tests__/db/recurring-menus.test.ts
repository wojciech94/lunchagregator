import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { adminClient, anonClient, runToken, signInIdentity } from './helpers';
import { addDaysISO } from '@/lib/offer-renewal';
import { menuContentSchema, menuDates, menuForDate, menuToday, type MenuContent } from '@/lib/recurring-menu';

const admin = adminClient();
const token = runToken('recurring');
const today = menuToday();
let owner: Awaited<ReturnType<typeof signInIdentity>>;
let other: Awaited<ReturnType<typeof signInIdentity>>;
const restaurants: string[] = [];
const dish = (name = 'Lunch', days = [1,2,3,4,5,6,7]) => ({ id: randomUUID(), dishName: `${token} ${name}`, price: 25, sourceType: 'text', days, items: ['Soup'], description: 'Lunch set', cuisineType: 'polska', dietaryTags: ['vegetarian'], allergens: ['mleko'] });
const content = (name = 'Lunch'): MenuContent => menuContentSchema.parse({ kind: 'fixed', entries: [dish(name)] });
async function fixture() {
  const { data, error } = await owner.client.from('restaurants').insert({ name: token, address: 'Test address', location: 'POINT(17.03 51.1)', user_id: owner.id, session_token: token }).select('id').single();
  expect(error).toBeNull(); restaurants.push(data!.id); return data!.id as string;
}
async function publish(rid: string, menu: MenuContent, effective = today) {
  const result = await owner.client.rpc('publish_recurring_menu', { rid, effective, menu });
  expect(result.error, result.error?.message).toBeNull();
}
async function visible(rid: string, date: string) {
  const result = await anonClient().from('visible_lunch_offers').select('*').eq('restaurant_id', rid).eq('available_date', date);
  expect(result.error).toBeNull(); return result.data!;
}
beforeAll(async () => { owner = await signInIdentity(token); other = await signInIdentity(token); });
afterAll(async () => {
  // `lunch_offers.restaurant_id` is ON DELETE SET NULL, so deleting the
  // restaurants alone would orphan every generated occurrence (up to 30 per
  // publish) and leak rows into the shared test database. Delete this suite's
  // offers first, then the restaurants (which cascade schedules, revisions and
  // exceptions).
  if (restaurants.length > 0) {
    await admin.from('lunch_offers').delete().in('restaurant_id', restaurants);
  }
  for (const id of restaurants) await admin.from('restaurants').delete().eq('id', id);
  if (owner) await admin.auth.admin.deleteUser(owner.id);
  if (other) await admin.auth.admin.deleteUser(other.id);
});

describe('recurring menus on real Supabase', () => {
  it('materializes the full horizon with stable identities and preserves all dish fields', async () => {
    const rid = await fixture(); const menu = content();
    await publish(rid, menu);
    const first = await visible(rid, addDaysISO(today, 7));
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ price: 25, items: ['Soup'], source_type: 'text', cuisine_type: 'polska', dietary_tags: ['vegetarian'], allergens: ['mleko'] });
    await publish(rid, menu);
    expect((await visible(rid, addDaysISO(today, 7)))[0].id).toBe(first[0].id);
    const { data } = await admin.from('lunch_offers').select('id').eq('restaurant_id', rid).eq('withdrawn', false);
    expect(data).toHaveLength(30);
    const { data: rpc, error } = await anonClient().rpc('get_offers_filtered', { p_date: addDaysISO(today, 7), p_search_query: token, p_price_min: 24, p_price_max: 26 });
    expect(error).toBeNull(); expect(rpc.some((r: { id: string }) => r.id === first[0].id)).toBe(true);
  });
  it('agrees with the deterministic preview for weekday schedules across all 30 dates', async () => {
    const rid = await fixture(); const menu = menuContentSchema.parse({ kind: 'weekday', entries: [dish('Monday', [1]), dish('Friday', [5])] });
    await publish(rid, menu);
    const { data, error } = await anonClient().from('visible_lunch_offers').select('available_date,dish_name').eq('restaurant_id', rid);
    expect(error).toBeNull();
    for (const date of menuDates(today)) expect(data!.filter(r => r.available_date === date).map(r => r.dish_name).sort()).toEqual(menuForDate([{ effectiveFrom: today, content: menu }], date).map(d => d.dishName).sort());
  });
  it('rejects another owner, anonymous writes, invalid SQL inputs and direct occurrence edits', async () => {
    const rid = await fixture(); const menu = content();
    expect((await other.client.rpc('publish_recurring_menu', { rid, effective: today, menu })).error).not.toBeNull();
    expect((await anonClient().rpc('publish_recurring_menu', { rid, effective: today, menu })).error).not.toBeNull();
    expect((await other.client.from('menu_schedules').insert({ restaurant_id: rid })).error).not.toBeNull();
    expect((await owner.client.rpc('publish_recurring_menu', { rid, effective: today, menu: { kind: 'fixed', entries: [{}] } })).error).not.toBeNull();
    await publish(rid, menu);
    const offer = (await visible(rid, today))[0];
    await owner.client.from('lunch_offers').update({ price: 1 }).eq('id', offer.id);
    expect((await visible(rid, today))[0].price).toBe(25);
    expect((await owner.client.rpc('run_recurring_menus')).error).not.toBeNull();
  });
  it('closure and replacement override independent offers and agree with RPC/detail visibility', async () => {
    const rid = await fixture(); const menu = content(); await publish(rid, menu);
    const date = addDaysISO(today, 3);
    const inserted = await owner.client.from('lunch_offers').insert({ dish_name: `${token} One-off`, price: 30, available_date: date, source_type: 'text', restaurant_name: token, restaurant_id: rid, user_id: owner.id }).select('id').single();
    expect(inserted.error).toBeNull();
    const original = (await visible(rid, date))[0];
    let result = await owner.client.rpc('change_recurring_menu', { rid, command: 'exception', payload: { kind: 'closed', date } });
    expect(result.error, result.error?.message).toBeNull(); expect(await visible(rid, date)).toHaveLength(0);
    const replacement = dish('Special');
    result = await owner.client.rpc('change_recurring_menu', { rid, command: 'exception', payload: { kind: 'replacement', date, dishes: [replacement] } });
    expect(result.error, result.error?.message).toBeNull();
    expect((await visible(rid, date)).map(r => r.dish_name)).toEqual([replacement.dishName]);
    const hidden = await anonClient().from('visible_lunch_offers').select('id').eq('id', original.id);
    expect(hidden.data).toHaveLength(0);
    const rpc = await anonClient().rpc('get_offers_filtered', { p_date: date });
    expect(rpc.data.filter((r: { restaurant_id: string }) => r.restaurant_id === rid)).toHaveLength(1);
    expect((await owner.client.rpc('change_recurring_menu', { rid, command: 'exception', payload: { kind: 'remove', date } })).error).toBeNull();
    expect(await visible(rid, date)).toHaveLength(2);
  });
  it('effective price edits preserve earlier dates and withdraw removed dishes without touching one-offs', async () => {
    const rid = await fixture(); const menu = content(); await publish(rid, menu);
    const tomorrow = addDaysISO(today, 1); const original = (await visible(rid, today))[0];
    const changed = { ...menu, entries: menu.entries.map(d => ({ ...d, price: 35 })) };
    await publish(rid, changed, tomorrow);
    expect((await visible(rid, today))[0].price).toBe(25);
    expect((await visible(rid, tomorrow))[0].price).toBe(35);
    expect((await visible(rid, today))[0].id).toBe(original.id);
    await publish(rid, content('New'), tomorrow);
    expect((await visible(rid, tomorrow)).map(r => r.dish_name)).not.toContain(menu.entries[0].dishName);
  });
  it('serializes generation with stop/edit, retains exceptions, and safely resumes', async () => {
    const rid = await fixture(); const menu = content(); await publish(rid, menu);
    const exceptionDate = addDaysISO(today, 2);
    expect((await owner.client.rpc('change_recurring_menu', { rid, command: 'exception', payload: { kind: 'replacement', date: exceptionDate, dishes: [dish('Special')] } })).error).toBeNull();
    await admin.from('menu_schedules').update({ reconciled_at: '2000-01-01' }).eq('restaurant_id', rid);
    const results = await Promise.all([
      admin.rpc('run_recurring_menus'),
      owner.client.rpc('change_recurring_menu', { rid, command: 'stop' }),
    ]);
    for (const result of results) expect(result.error, result.error?.message).toBeNull();
    expect(await visible(rid, today)).toHaveLength(0);
    expect(await visible(rid, exceptionDate)).toHaveLength(1);
    expect((await owner.client.rpc('change_recurring_menu', { rid, command: 'resume' })).error).toBeNull();
    expect(await visible(rid, today)).toHaveLength(1);
    await admin.from('menu_schedules').update({ reconciled_at: '2000-01-01' }).eq('restaurant_id', rid);
    const concurrent = await Promise.all([publish(rid, { ...menu, entries: menu.entries.map(d => ({ ...d, price: 40 })) }), admin.rpc('run_recurring_menus')]);
    expect(concurrent[1]?.error).toBeNull();
    expect((await visible(rid, today))[0].price).toBe(40);
  });
});
