import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), geocode: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/services/geocoding', () => ({ geocodeAddress: mocks.geocode }));
import { createOffer, renewRestaurantMenu } from './offers';

const userId = '11111111-1111-4111-8111-111111111111';
const restaurantId = '550e8400-e29b-41d4-a716-446655440000';
const today = new Date().toISOString().slice(0, 10);
const input = { dishName: 'Pizza', price: 25, restaurantName: 'Client name', restaurantId, availableDate: today, sourceType: 'text' };

function fixture(restaurant: Record<string, unknown> | null, sourceCuisine: string | null = null) {
  const inserted: Record<string, unknown>[] = [];
  const source = { id: 'source', dish_name: 'Pizza', price: 25, available_date: today, source_type: 'text', cuisine_type: sourceCuisine };
  mocks.createClient.mockResolvedValue({ from: (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'gte', 'order']) chain[method] = () => chain;
    chain.limit = async () => ({ data: [source], error: null });
    chain.insert = (row: Record<string, unknown>) => { inserted.push(row); return chain; };
    chain.single = async () => ({ data: table === 'restaurants' ? restaurant : { ...inserted.at(-1), id: 'saved', currency: 'PLN' }, error: null });
    return chain;
  } });
  return inserted;
}

beforeEach(() => { vi.clearAllMocks(); mocks.geocode.mockResolvedValue(null); });
const restaurant = { name: 'Pizza Si', address: 'Wroclaw', location: 'POINT(17.03 51.1)', cuisine_types: ['wloska'] };

describe('linked offer consistency', () => {
  it('uses an unambiguous restaurant cuisine when the offer has none', async () => {
    const rows = fixture(restaurant);
    const result = await createOffer(input, userId);
    expect(result).toMatchObject({ success: true, data: { cuisineType: 'wloska', restaurantAddress: 'Wroclaw', restaurantLocation: { latitude: 51.1, longitude: 17.03 } } });
    expect(rows[0].cuisine_type).toBe('wloska');
  });
  it('preserves an explicit dish cuisine', async () => {
    const rows = fixture(restaurant);
    await createOffer({ ...input, cuisineType: 'polska' }, userId);
    expect(rows[0].cuisine_type).toBe('polska');
  });
  it.each([{ cuisines: [] }, { cuisines: ['polska', 'wloska'] }, { cuisines: ['invalid'] }])('does not guess cuisine from $cuisines', async ({ cuisines }) => {
    const rows = fixture({ ...restaurant, cuisine_types: cuisines });
    await createOffer(input, userId);
    expect(rows[0].cuisine_type).toBeNull();
  });
  it('does not substitute a client address for a coordinate-only restaurant', async () => {
    const rows = fixture({ ...restaurant, address: null });
    await createOffer({ ...input, restaurantAddress: 'Stale client address' }, userId);
    expect(rows[0].restaurant_address).toBeNull();
    expect(mocks.geocode).not.toHaveBeenCalled();
  });
  it('refuses an unresolved restaurant before geocoding or insertion', async () => {
    const rows = fixture(null);
    expect(await createOffer({ ...input, restaurantAddress: 'Client address' }, userId)).toMatchObject({ success: false });
    expect(rows).toHaveLength(0);
    expect(mocks.geocode).not.toHaveBeenCalled();
  });
  it('preserves explicit dish cuisine on renewal while taking the current place', async () => {
    const rows = fixture(restaurant, 'polska');
    expect(await renewRestaurantMenu(restaurantId, userId)).toMatchObject({ success: true, data: { created: 1 } });
    expect(rows[0]).toMatchObject({ cuisine_type: 'polska', restaurant_address: 'Wroclaw', restaurant_location: restaurant.location });
    expect(mocks.geocode).not.toHaveBeenCalled();
  });
  it('preserves unknown cuisine on renewal even if the restaurant now has one cuisine', async () => {
    const rows = fixture(restaurant, null);
    expect(await renewRestaurantMenu(restaurantId, userId)).toMatchObject({ success: true, data: { created: 1 } });
    expect(rows[0]).toMatchObject({ cuisine_type: null, restaurant_address: 'Wroclaw', restaurant_location: restaurant.location });
    expect(mocks.geocode).not.toHaveBeenCalled();
  });
});
