import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock setup
// ============================================================================

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/services/geocoding', () => ({
  geocodeAddress: vi.fn(() =>
    Promise.resolve({ latitude: 52.2297, longitude: 21.0122 })
  ),
}));

vi.mock('@/lib/auth', () => ({
  getUser: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth';
import { createOffer } from '@/services/offers';
import { updateRestaurant, deleteRestaurant } from '@/actions/restaurants';

const mockedCreateClient = vi.mocked(createClient);
const mockedGetUser = vi.mocked(getUser);

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';

// ============================================================================
// Helpers
// ============================================================================

function createDbRestaurantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Restauracja Testowa',
    description: 'Opis testowy',
    address: 'ul. Testowa 1, Warszawa',
    location: 'POINT(21.0122 52.2297)',
    price_level: 'średnia',
    lunch_hours_start: '11:00',
    lunch_hours_end: '15:00',
    cuisine_types: ['polska', 'wloska'],
    phone_number: '123456789',
    website_url: 'https://test.pl',
    session_token: null,
    user_id: TEST_USER_ID,
    created_at: '2024-01-01T12:00:00Z',
    updated_at: '2024-01-01T12:00:00Z',
    ...overrides,
  };
}

function createDbOfferRow(overrides: Record<string, unknown> = {}) {
  const today = new Date().toISOString().split('T')[0];
  return {
    id: 'offer-001',
    dish_name: 'Pierogi ruskie',
    items: ['pierogi', 'śmietana'],
    price: 25.0,
    currency: 'PLN',
    description: 'Domowe pierogi',
    restaurant_id: '550e8400-e29b-41d4-a716-446655440000',
    restaurant_name: 'Restauracja Testowa',
    restaurant_address: 'ul. Testowa 1, Warszawa',
    restaurant_location: 'POINT(21.0122 52.2297)',
    available_date: today,
    cuisine_type: 'polska',
    dietary_tags: ['vegetarian'],
    allergens: ['gluten'],
    source_type: 'text',
    session_token: 'offer-session-token',
    created_at: '2024-01-01T12:00:00Z',
    updated_at: '2024-01-01T12:00:00Z',
    ...overrides,
  };
}

/**
 * Creates a chainable mock that returns itself for any method call,
 * except for the terminal method which resolves with the given result.
 */
function createChainableMock(terminalMethod: string, result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = [
    'select', 'insert', 'update', 'delete', 'eq', 'in', 'gte', 'lte',
    'or', 'overlaps', 'order', 'range', 'limit', 'ilike', 'single', 'head',
    'contains',
  ];

  for (const method of methods) {
    if (method === terminalMethod) {
      chain[method] = vi.fn().mockResolvedValue(result);
    } else {
      chain[method] = vi.fn().mockReturnValue(chain);
    }
  }

  return chain;
}

// ============================================================================
// Tests
// ============================================================================

describe('Restaurant-Offer Association — Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUser.mockResolvedValue({ id: TEST_USER_ID } as never);
  });

  // ==========================================================================
  // Creating an offer WITH restaurantId
  // ==========================================================================

  describe('Creating an offer with restaurantId', () => {
    it('stores the FK and fetches restaurant location for the snapshot', async () => {
      const restaurantId = '550e8400-e29b-41d4-a716-446655440000';
      const restaurantLocation = 'POINT(21.0122 52.2297)';

      // Chain for fetching restaurant location (restaurants table)
      const restaurantFetchChain = createChainableMock('single', {
        data: { location: restaurantLocation },
        error: null,
      });

      // Chain for inserting the offer (lunch_offers table)
      const offerRow = createDbOfferRow({
        restaurant_id: restaurantId,
        restaurant_location: restaurantLocation,
      });
      const offerInsertChain = createChainableMock('single', {
        data: offerRow,
        error: null,
      });

      const mockFromFn = vi.fn()
        .mockReturnValueOnce(restaurantFetchChain)  // restaurants: fetch location
        .mockReturnValueOnce(offerInsertChain);     // lunch_offers: insert offer

      mockedCreateClient.mockResolvedValue({ from: mockFromFn } as never);

      const today = new Date().toISOString().split('T')[0];
      const result = await createOffer(
        {
          dishName: 'Pierogi ruskie',
          price: 25.0,
          restaurantName: 'Restauracja Testowa',
          availableDate: today,
          sourceType: 'text',
          restaurantId,
          restaurantAddress: 'ul. Testowa 1, Warszawa',
        },
        'offer-session-token'
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.restaurantId).toBe(restaurantId);
        expect(result.data.restaurantLocation).toEqual({
          latitude: 52.2297,
          longitude: 21.0122,
        });
      }

      // Verify that the restaurant location was fetched
      expect(mockFromFn).toHaveBeenCalledTimes(2);
    });

    it('stores the FK even when restaurant has no location', async () => {
      const restaurantId = '550e8400-e29b-41d4-a716-446655440000';

      // Restaurant has no location
      const restaurantFetchChain = createChainableMock('single', {
        data: { location: null },
        error: null,
      });

      // Offer inserted without restaurant_location
      const offerRow = createDbOfferRow({
        restaurant_id: restaurantId,
        restaurant_location: null,
      });
      const offerInsertChain = createChainableMock('single', {
        data: offerRow,
        error: null,
      });

      const mockFromFn = vi.fn()
        .mockReturnValueOnce(restaurantFetchChain)
        .mockReturnValueOnce(offerInsertChain);

      mockedCreateClient.mockResolvedValue({ from: mockFromFn } as never);

      const today = new Date().toISOString().split('T')[0];
      const result = await createOffer(
        {
          dishName: 'Sałatka grecka',
          price: 18.0,
          restaurantName: 'Restauracja Testowa',
          availableDate: today,
          sourceType: 'text',
          restaurantId,
        },
        'offer-session-token'
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.restaurantId).toBe(restaurantId);
        expect(result.data.restaurantLocation).toBeNull();
      }
    });
  });

  // ==========================================================================
  // Creating an offer WITHOUT restaurantId (backward compatibility)
  // ==========================================================================

  describe('Creating an offer without restaurantId', () => {
    it('allows manual restaurant data entry without FK', async () => {
      const offerRow = createDbOfferRow({
        restaurant_id: null,
        restaurant_location: null,
      });
      const offerInsertChain = createChainableMock('single', {
        data: offerRow,
        error: null,
      });

      // Only one from() call — no restaurant fetch needed
      const mockFromFn = vi.fn().mockReturnValueOnce(offerInsertChain);

      mockedCreateClient.mockResolvedValue({ from: mockFromFn } as never);

      const today = new Date().toISOString().split('T')[0];
      const result = await createOffer(
        {
          dishName: 'Pierogi ruskie',
          price: 25.0,
          restaurantName: 'Restauracja Ręczna',
          availableDate: today,
          sourceType: 'text',
          restaurantAddress: 'ul. Ręczna 5, Kraków',
        },
        'offer-session-token'
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.restaurantId).toBeUndefined();
        expect(result.data.restaurantName).toBe('Restauracja Testowa'); // from DB row
      }

      // Verify no restaurant fetch was made — only one from() call for insert
      expect(mockFromFn).toHaveBeenCalledTimes(1);
    });

    it('preserves existing behavior for offers with embedded restaurant data', async () => {
      const offerRow = createDbOfferRow({
        restaurant_id: null,
        restaurant_name: 'Manualna Restauracja',
        restaurant_address: 'ul. Manualna 10',
        restaurant_location: null,
      });
      const offerInsertChain = createChainableMock('single', {
        data: offerRow,
        error: null,
      });

      const mockFromFn = vi.fn().mockReturnValueOnce(offerInsertChain);
      mockedCreateClient.mockResolvedValue({ from: mockFromFn } as never);

      const today = new Date().toISOString().split('T')[0];
      const result = await createOffer(
        {
          dishName: 'Barszcz',
          price: 12.0,
          restaurantName: 'Manualna Restauracja',
          availableDate: today,
          sourceType: 'link',
          restaurantAddress: 'ul. Manualna 10',
        },
        'offer-session-token'
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.restaurantName).toBe('Manualna Restauracja');
        expect(result.data.restaurantAddress).toBe('ul. Manualna 10');
        expect(result.data.restaurantId).toBeUndefined();
      }
    });
  });

  // ==========================================================================
  // Offer snapshot preservation on restaurant update
  // ==========================================================================

  describe('Offer snapshot preservation on restaurant update', () => {
    it('updating restaurant does NOT modify previously created offers', async () => {
      // This test verifies the logic flow:
      // 1. Restaurant exists with name "Restauracja Testowa"
      // 2. An offer was created with snapshot of that name
      // 3. Restaurant is updated to "Nowa Nazwa"
      // 4. The offer still has the original "Restauracja Testowa" name
      //
      // The key insight: updateRestaurant only updates the restaurants table,
      // it does NOT touch the lunch_offers table. Offers retain their snapshot.

      const existingRow = createDbRestaurantRow();
      const updatedRow = createDbRestaurantRow({
        name: 'Nowa Nazwa Restauracji',
        address: 'ul. Nowa 99, Warszawa',
      });

      // Fetch existing restaurant
      const fetchChain = createChainableMock('single', { data: existingRow, error: null });
      // Update restaurant
      const updateChain = createChainableMock('single', { data: updatedRow, error: null });

      const mockFromFn = vi.fn()
        .mockReturnValueOnce(fetchChain)   // fetch existing
        .mockReturnValueOnce(updateChain); // update restaurant

      mockedCreateClient.mockResolvedValue({ from: mockFromFn } as never);

      const result = await updateRestaurant(
        '550e8400-e29b-41d4-a716-446655440000',
        { name: 'Nowa Nazwa Restauracji', address: 'ul. Nowa 99, Warszawa' }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Nowa Nazwa Restauracji');
      }

      // Verify that only 2 from() calls were made (fetch + update on restaurants table)
      // No calls to lunch_offers table — offers are NOT modified
      expect(mockFromFn).toHaveBeenCalledTimes(2);

      // Verify the from() calls were for 'restaurants' table only
      const fromCalls = mockFromFn.mock.calls;
      expect(fromCalls[0][0]).toBe('restaurants');
      expect(fromCalls[1][0]).toBe('restaurants');
    });

    it('offer retains original restaurant data after restaurant name change', async () => {
      // Simulate the full flow:
      // 1. Create offer with restaurantId (snapshot taken)
      // 2. Update restaurant name
      // 3. Verify offer data is unchanged (by reading the offer)

      // Step 1: Create offer with restaurant association
      const restaurantId = '550e8400-e29b-41d4-a716-446655440000';
      const originalOfferRow = createDbOfferRow({
        restaurant_id: restaurantId,
        restaurant_name: 'Restauracja Testowa',
        restaurant_address: 'ul. Testowa 1, Warszawa',
        restaurant_location: 'POINT(21.0122 52.2297)',
      });

      const restaurantFetchChain = createChainableMock('single', {
        data: { location: 'POINT(21.0122 52.2297)' },
        error: null,
      });
      const offerInsertChain = createChainableMock('single', {
        data: originalOfferRow,
        error: null,
      });

      const createFromFn = vi.fn()
        .mockReturnValueOnce(restaurantFetchChain)
        .mockReturnValueOnce(offerInsertChain);

      mockedCreateClient.mockResolvedValue({ from: createFromFn } as never);

      const today = new Date().toISOString().split('T')[0];
      const createResult = await createOffer(
        {
          dishName: 'Pierogi ruskie',
          price: 25.0,
          restaurantName: 'Restauracja Testowa',
          availableDate: today,
          sourceType: 'text',
          restaurantId,
        },
        'offer-session-token'
      );

      expect(createResult.success).toBe(true);
      if (createResult.success) {
        // The offer has the original restaurant data as a snapshot
        expect(createResult.data.restaurantName).toBe('Restauracja Testowa');
        expect(createResult.data.restaurantAddress).toBe('ul. Testowa 1, Warszawa');
        expect(createResult.data.restaurantLocation).toEqual({
          latitude: 52.2297,
          longitude: 21.0122,
        });
      }

      // Step 2: Update restaurant (different mock setup)
      vi.clearAllMocks();

      const existingRow = createDbRestaurantRow();
      const updatedRow = createDbRestaurantRow({ name: 'Zmieniona Nazwa' });

      const fetchChain = createChainableMock('single', { data: existingRow, error: null });
      const updateChain = createChainableMock('single', { data: updatedRow, error: null });

      const updateFromFn = vi.fn()
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain);

      mockedCreateClient.mockResolvedValue({ from: updateFromFn } as never);

      const updateResult = await updateRestaurant(
        restaurantId,
        { name: 'Zmieniona Nazwa' }
      );

      expect(updateResult.success).toBe(true);

      // The offer's snapshot data remains unchanged — the update only touched restaurants table
      // This is verified by the fact that no lunch_offers queries were made during update
      expect(updateFromFn).toHaveBeenCalledTimes(2);
      expect(updateFromFn.mock.calls[0][0]).toBe('restaurants');
      expect(updateFromFn.mock.calls[1][0]).toBe('restaurants');
    });
  });

  // ==========================================================================
  // Offer data preservation on restaurant deletion
  // ==========================================================================

  describe('Offer data preservation on restaurant deletion', () => {
    it('deletes the restaurant without issuing a snapshot update to offers', async () => {
      const restaurantId = '550e8400-e29b-41d4-a716-446655440000';
      const fetchChain = createChainableMock('single', {
        data: createDbRestaurantRow({ id: restaurantId, name: 'Renamed restaurant', address: 'New address' }), error: null,
      });
      const deleteChain = { delete: vi.fn(), eq: vi.fn().mockResolvedValue({ error: null }) };
      deleteChain.delete.mockReturnValue(deleteChain);
      const from = vi.fn().mockReturnValueOnce(fetchChain).mockReturnValueOnce(deleteChain);
      mockedCreateClient.mockResolvedValue({ from } as never);
      expect(await deleteRestaurant(restaurantId)).toEqual({ success: true, data: undefined });
      expect(from.mock.calls.map(([table]) => table)).toEqual(['restaurants', 'restaurants']);
      expect(deleteChain.eq).toHaveBeenCalledWith('id', restaurantId);
    });

    it('reports a refused deletion without writing to linked offers', async () => {
      const fetchChain = createChainableMock('single', { data: createDbRestaurantRow(), error: null });
      const deleteChain = { delete: vi.fn(), eq: vi.fn().mockResolvedValue({ error: { message: 'delete refused' } }) };
      deleteChain.delete.mockReturnValue(deleteChain);
      const from = vi.fn().mockReturnValueOnce(fetchChain).mockReturnValueOnce(deleteChain);
      mockedCreateClient.mockResolvedValue({ from } as never);
      expect(await deleteRestaurant('550e8400-e29b-41d4-a716-446655440000')).toMatchObject({ success: false, error: expect.stringContaining('delete refused') });
      expect(from.mock.calls.map(([table]) => table)).toEqual(['restaurants', 'restaurants']);
    });
  });
});
