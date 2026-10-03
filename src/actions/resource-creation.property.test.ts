import { describe, expect, it, vi } from 'vitest';
import { fc } from '../../__tests__/properties/fc-config';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  geocodeAddress: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/services/geocoding', () => ({ geocodeAddress: mocks.geocodeAddress }));

import { createRestaurant } from '@/actions/restaurants';
import { createOfferAction } from '@/actions/offers';

const textArb = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz '), { minLength: 2, maxLength: 20 })
  .map((characters) => characters.join(''));
const restaurantInputArb = textArb.map((name) => ({ name, location: { latitude: 52.2297, longitude: 21.0122 } }));
const offerInputArb = textArb.map((dishName) => ({
  dishName,
  price: 25,
  restaurantName: 'Lunch Bar',
  availableDate: new Date().toISOString().slice(0, 10),
  sourceType: 'text' as const,
}));

// Feature: user-authentication, Property 7: user_id is stored on resource creation
// **Validates: Requirements 5.1, 5.2**
describe('Property 7: resource creation stores the authenticated user ID', () => {
  it('uses the authenticated ID for every restaurant and offer insert', async () => {
    await fc.assert(fc.asyncProperty(fc.uuid(), restaurantInputArb, offerInputArb, async (userId, restaurantInput, offerInput) => {
      let restaurantInsert: Record<string, unknown> | undefined;
      let offerInsert: Record<string, unknown> | undefined;
      const returning = (row: Record<string, unknown>, extra: Record<string, unknown>) => ({ select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { ...row, ...extra }, error: null }) })) });
      const restaurantQuery = { insert: vi.fn((row: Record<string, unknown>) => { restaurantInsert = row; return returning(row, { id: 'restaurant-id', created_at: '', updated_at: '' }); }) };
      const offerQuery = { insert: vi.fn((row: Record<string, unknown>) => { offerInsert = row; return returning(row, { id: 'offer-id', currency: 'PLN', session_token: '', created_at: '', updated_at: '' }); }) };
      mocks.getUser.mockResolvedValue({ id: userId });
      mocks.createClient.mockResolvedValue({ from: (table: string) => table === 'restaurants' ? restaurantQuery : offerQuery });

      expect((await createRestaurant(restaurantInput)).success).toBe(true);
      expect((await createOfferAction(offerInput)).success).toBe(true);
      expect(restaurantInsert?.user_id).toBe(userId);
      expect(offerInsert?.user_id).toBe(userId);
    }));
  });
});