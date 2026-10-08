import { afterAll, beforeAll, expect, it } from 'vitest';
import { adminClient, anonClient, deleteOffersWithToken, runToken, todayUtc } from './helpers';
import { periodDates, shiftDate } from '@/lib/recommendation-period';

const admin = adminClient();
const anon = anonClient();
const token = runToken('db-recommendation');
const today = todayUtc();
const start = shiftDate(today, 1);
const end = shiftDate(today, 3);

beforeAll(async () => {
  const rows = [today, start, shiftDate(today, 2), end, shiftDate(today, 4)]
    .flatMap(date => Array.from({ length: date === start ? 61 : 1 }, (_, index) => ({
      dish_name: `${token} dish ${index}`, restaurant_name: `${token} ${String(index).padStart(3, '0')}`,
      available_date: date, price: 25, source_type: 'text', session_token: token,
      dietary_tags: ['vegetarian'], cuisine_type: 'polska',
    })));
  const { error } = await admin.from('lunch_offers').insert(rows);
  if (error) throw error;
});
afterAll(() => deleteOffersWithToken(admin, token));

it('uses the existing RPC to cover inclusive future dates, filter before paging and retrieve beyond page one', async () => {
  const found: { available_date: string; restaurant_name: string }[] = [];
  for (const date of periodDates({ start, end })) {
    for (let page = 0; page < 4; page++) {
      const { data, error } = await anon.rpc('get_offers_filtered', {
        p_date: date, p_search_query: token, p_dietary_tags: ['vegetarian'],
        p_cuisine_types: ['polska'], p_price_min: 20, p_price_max: 30,
        p_limit: 50, p_offset: page * 50,
      });
      if (error) throw error;
      found.push(...data);
      if (data.length < 50) break;
    }
  }
  expect(found).toHaveLength(63);
  expect(new Set(found.map(row => row.available_date))).toEqual(new Set([start, shiftDate(today, 2), end]));
  expect(found.some(row => row.restaurant_name === `${token} 060`)).toBe(true);
  const { data, error } = await anon.rpc('get_offers_filtered', {
    p_date: start, p_search_query: token, p_dietary_tags: ['vegan'], p_limit: 50, p_offset: 0,
  });
  expect(error).toBeNull();
  expect(data).toEqual([]);
});
