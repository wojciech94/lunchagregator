import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), geocode: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/services/geocoding', () => ({ geocodeAddress: mocks.geocode }));
import { updateOffer } from './offers';

const address = 'Wojciecha Bogusławskiego 89, Wrocław';
const restaurant = { address, location: 'POINT(17.03 51.1)' };
const original = {
  id: 'offer', restaurant_id: 'restaurant', restaurant_name: 'Restaurant',
  restaurant_address: null, restaurant_location: null, dish_name: 'Soup', price: 25,
};

type OfferFixture = Omit<typeof original, 'restaurant_id' | 'restaurant_address' | 'restaurant_location'> & {
  restaurant_id: string | null;
  restaurant_address: string | null;
  restaurant_location: string | null;
};

function fixture(offer: OfferFixture = original, place: { address: string | null; location: string | null } | null = restaurant) {
  const update = vi.fn();
  mocks.createClient.mockResolvedValue({ from: (table: string) => {
    let patch: Record<string, unknown> | undefined;
    const query = {
      select: () => query, eq: () => query,
      update: (row: Record<string, unknown>) => { patch = row; update(row); return query; },
      single: async () => ({ data: table === 'restaurants' ? place : { ...offer, ...patch }, error: null }),
    };
    return query;
  } });
  return update;
}

beforeEach(() => { vi.clearAllMocks(); mocks.geocode.mockResolvedValue({ latitude: 52, longitude: 18 }); });

describe('offer location repairs', () => {
  it('reuses linked restaurant coordinates when entering its address on an old offer', async () => {
    const update = fixture();
    const result = await updateOffer('offer', { restaurantAddress: address });
    expect(result).toMatchObject({ success: true, data: { restaurantAddress: address, restaurantLocation: { latitude: 51.1, longitude: 17.03 } } });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ restaurant_location: restaurant.location }));
    expect(mocks.geocode).not.toHaveBeenCalled();
  });
  it('explicitly restores missing address and coordinates from the linked restaurant', async () => {
    fixture();
    expect(await updateOffer('offer', { useRestaurantLocation: true })).toMatchObject({
      success: true, data: { restaurantAddress: address, restaurantLocation: { latitude: 51.1, longitude: 17.03 } },
    });
  });
  it('geocodes a different address instead of borrowing unrelated restaurant coordinates', async () => {
    const update = fixture({ ...original, restaurant_address: address, restaurant_location: restaurant.location });
    await updateOffer('offer', { restaurantAddress: 'New address' });
    expect(mocks.geocode).toHaveBeenCalledWith('New address');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ restaurant_location: 'POINT(18 52)' }));
  });
  it('clears stale coordinates if the new address cannot be geocoded and reports the warning', async () => {
    mocks.geocode.mockResolvedValue(null);
    const update = fixture({ ...original, restaurant_address: address, restaurant_location: restaurant.location });
    expect(await updateOffer('offer', { restaurantAddress: 'Unknown address' })).toMatchObject({ success: true, locationWarning: true });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ restaurant_location: null }));
  });
  it('clears coordinates when removing the address', async () => {
    const update = fixture({ ...original, restaurant_address: address, restaurant_location: restaurant.location });
    await updateOffer('offer', { restaurantAddress: null });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ restaurant_location: null }));
  });
  it('preserves a complete published snapshot during ordinary edits', async () => {
    const update = fixture({ ...original, restaurant_address: 'Historical address', restaurant_location: 'POINT(16 50)' });
    await updateOffer('offer', { restaurantAddress: 'Historical address', price: 30 });
    expect(update.mock.calls[0][0]).not.toHaveProperty('restaurant_location');
    expect(mocks.geocode).not.toHaveBeenCalled();
  });
  it('retries missing coordinates even when the address is unchanged', async () => {
    fixture({ ...original, restaurant_address: address });
    expect(await updateOffer('offer', { restaurantAddress: address })).toMatchObject({
      success: true, data: { restaurantLocation: { latitude: 51.1, longitude: 17.03 } },
    });
  });
  it('refuses explicit restoration without a linked restaurant', async () => {
    const update = fixture({ ...original, restaurant_id: null });
    expect(await updateOffer('offer', { useRestaurantLocation: true })).toMatchObject({ success: false });
    expect(update).not.toHaveBeenCalled();
  });
  it('geocodes the restaurant address when its own coordinates are missing', async () => {
    fixture(original, { ...restaurant, location: null });
    expect(await updateOffer('offer', { useRestaurantLocation: true })).toMatchObject({
      success: true, data: { restaurantAddress: address, restaurantLocation: { latitude: 52, longitude: 18 } },
    });
    expect(mocks.geocode).toHaveBeenCalledWith(address);
  });
  it('saves and warns even if the geocoder throws', async () => {
    mocks.geocode.mockRejectedValue(new Error('Unavailable'));
    fixture();
    expect(await updateOffer('offer', { restaurantAddress: 'Other address' })).toMatchObject({
      success: true, locationWarning: true, data: { restaurantLocation: null },
    });
  });
});
