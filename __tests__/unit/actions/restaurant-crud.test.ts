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
import {
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
  listRestaurants,
  getRestaurant,
  searchRestaurants,
} from '@/actions/restaurants';

const mockedCreateClient = vi.mocked(createClient);
const mockedGetUser = vi.mocked(getUser);

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_USER_ID = '22222222-2222-2222-2222-222222222222';

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

/**
 * Creates a chainable mock that returns itself for any method call,
 * except for the terminal method which resolves with the given result.
 */
function createChainableMock(terminalMethod: string, result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'in', 'gte', 'lte', 'or', 'overlaps', 'order', 'range', 'limit', 'ilike', 'single', 'head'];

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

describe('Restaurant CRUD Server Actions — Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated user
    mockedGetUser.mockResolvedValue({ id: TEST_USER_ID } as never);
  });

  // ==========================================================================
  // createRestaurant
  // ==========================================================================

  describe('createRestaurant', () => {
    it('creates a restaurant with valid input', async () => {
      const dbRow = createDbRestaurantRow();

      const chain = createChainableMock('single', { data: dbRow, error: null });
      mockedCreateClient.mockResolvedValue({ from: vi.fn().mockReturnValue(chain) } as never);

      const result = await createRestaurant({
        name: 'Restauracja Testowa',
        address: 'ul. Testowa 1, Warszawa',
        description: 'Opis testowy',
        priceLevel: 'średnia',
        lunchHours: { start: '11:00', end: '15:00' },
        cuisineTypes: ['polska', 'wloska'],
        phoneNumber: '123456789',
        websiteUrl: 'https://test.pl',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Restauracja Testowa');
        expect(result.data.address).toBe('ul. Testowa 1, Warszawa');
        expect(result.data.priceLevel).toBe('średnia');
        expect(result.data.cuisineTypes).toEqual(['polska', 'wloska']);
        expect(result.data.userId).toBe(TEST_USER_ID);
      }
    });

    it('returns auth error when user is not authenticated', async () => {
      mockedGetUser.mockResolvedValue(null);

      const result = await createRestaurant({
        name: 'Restauracja Testowa',
        address: 'ul. Testowa 1',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Brak autoryzacji');
      }
    });

    it('returns validation errors for invalid input — name too short', async () => {
      const result = await createRestaurant({
        name: 'A', // too short (min 2)
        address: 'ul. Testowa 1',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Nieprawidłowe dane restauracji');
        expect(result.fieldErrors).toBeDefined();
        expect(result.fieldErrors!['name']).toBeDefined();
      }
    });

    it('returns validation errors when neither address nor location is provided', async () => {
      const result = await createRestaurant({
        name: 'Restauracja Testowa',
        // no address, no location
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Nieprawidłowe dane restauracji');
      }
    });

    it('returns error on database insert failure', async () => {
      const chain = createChainableMock('single', {
        data: null,
        error: { message: 'Insert failed' },
      });
      mockedCreateClient.mockResolvedValue({ from: vi.fn().mockReturnValue(chain) } as never);

      const result = await createRestaurant({
        name: 'Restauracja Testowa',
        address: 'ul. Testowa 1',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Nie udało się utworzyć restauracji');
      }
    });
  });

  // ==========================================================================
  // updateRestaurant
  // ==========================================================================

  describe('updateRestaurant', () => {
    it('updates restaurant when user_id matches', async () => {
      const existingRow = createDbRestaurantRow();
      const updatedRow = createDbRestaurantRow({ name: 'Nowa Nazwa' });

      // First from() call fetches existing, second from() call does the update
      const fetchChain = createChainableMock('single', { data: existingRow, error: null });
      const updateChain = createChainableMock('single', { data: updatedRow, error: null });

      const mockFromFn = vi.fn()
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain);

      mockedCreateClient.mockResolvedValue({ from: mockFromFn } as never);

      const result = await updateRestaurant(
        '550e8400-e29b-41d4-a716-446655440000',
        { name: 'Nowa Nazwa' }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Nowa Nazwa');
      }
    });

    it('rejects update when user_id does not match', async () => {
      const existingRow = createDbRestaurantRow({ user_id: OTHER_USER_ID });

      const fetchChain = createChainableMock('single', { data: existingRow, error: null });
      mockedCreateClient.mockResolvedValue({ from: vi.fn().mockReturnValue(fetchChain) } as never);

      const result = await updateRestaurant(
        '550e8400-e29b-41d4-a716-446655440000',
        { name: 'Nowa Nazwa' }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Brak uprawnień do tej operacji');
      }
    });

    it('rejects update when resource user_id is null (unmigrated)', async () => {
      const existingRow = createDbRestaurantRow({ user_id: null });

      const fetchChain = createChainableMock('single', { data: existingRow, error: null });
      mockedCreateClient.mockResolvedValue({ from: vi.fn().mockReturnValue(fetchChain) } as never);

      const result = await updateRestaurant(
        '550e8400-e29b-41d4-a716-446655440000',
        { name: 'Nowa Nazwa' }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Brak uprawnień do tej operacji');
      }
    });

    it('returns auth error when user is not authenticated', async () => {
      mockedGetUser.mockResolvedValue(null);

      const result = await updateRestaurant(
        '550e8400-e29b-41d4-a716-446655440000',
        { name: 'Nowa Nazwa' }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Brak autoryzacji');
      }
    });

    it('returns error when restaurant not found', async () => {
      const fetchChain = createChainableMock('single', {
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });
      mockedCreateClient.mockResolvedValue({ from: vi.fn().mockReturnValue(fetchChain) } as never);

      const result = await updateRestaurant(
        'non-existent-id',
        { name: 'Nowa Nazwa' }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Nie znaleziono restauracji');
      }
    });
  });

  // ==========================================================================
  // deleteRestaurant
  // ==========================================================================

  describe('deleteRestaurant', () => {
    it('deletes restaurant when user_id matches and no associated offers', async () => {
      const existingRow = createDbRestaurantRow();

      // Fetch restaurant chain
      const fetchChain = createChainableMock('single', { data: existingRow, error: null });

      // Delete chain
      const deleteChain: Record<string, unknown> = {};
      deleteChain.delete = vi.fn().mockReturnValue(deleteChain);
      deleteChain.eq = vi.fn().mockResolvedValue({ error: null });

      const mockFromFn = vi.fn()
        .mockReturnValueOnce(fetchChain)       // restaurants fetch
        .mockReturnValueOnce(deleteChain);     // restaurants delete

      mockedCreateClient.mockResolvedValue({ from: mockFromFn } as never);

      const result = await deleteRestaurant('550e8400-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(true);
    });

    it('rejects delete when user_id does not match', async () => {
      const existingRow = createDbRestaurantRow({ user_id: OTHER_USER_ID });

      const fetchChain = createChainableMock('single', { data: existingRow, error: null });
      mockedCreateClient.mockResolvedValue({ from: vi.fn().mockReturnValue(fetchChain) } as never);

      const result = await deleteRestaurant('550e8400-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Brak uprawnień do tej operacji');
      }
    });

    it('rejects delete when resource user_id is null (unmigrated)', async () => {
      const existingRow = createDbRestaurantRow({ user_id: null });

      const fetchChain = createChainableMock('single', { data: existingRow, error: null });
      mockedCreateClient.mockResolvedValue({ from: vi.fn().mockReturnValue(fetchChain) } as never);

      const result = await deleteRestaurant('550e8400-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Brak uprawnień do tej operacji');
      }
    });

    it('returns auth error when user is not authenticated', async () => {
      mockedGetUser.mockResolvedValue(null);

      const result = await deleteRestaurant('550e8400-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Brak autoryzacji');
      }
    });

    it('does not rewrite linked offer snapshots before deletion', async () => {
      const fetchChain = createChainableMock('single', { data: createDbRestaurantRow(), error: null });
      const deleteChain = { delete: vi.fn(), eq: vi.fn().mockResolvedValue({ error: null }) };
      deleteChain.delete.mockReturnValue(deleteChain);
      const from = vi.fn().mockReturnValueOnce(fetchChain).mockReturnValueOnce(deleteChain);
      mockedCreateClient.mockResolvedValue({ from } as never);
      expect(await deleteRestaurant('550e8400-e29b-41d4-a716-446655440000')).toEqual({ success: true, data: undefined });
      expect(from.mock.calls.map(([table]) => table)).toEqual(['restaurants', 'restaurants']);
    });

    it('returns error when restaurant not found', async () => {
      const fetchChain = createChainableMock('single', {
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });
      mockedCreateClient.mockResolvedValue({ from: vi.fn().mockReturnValue(fetchChain) } as never);

      const result = await deleteRestaurant('non-existent-id');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Nie znaleziono restauracji');
      }
    });
  });

  // ==========================================================================
  // listRestaurants
  // ==========================================================================

  describe('listRestaurants', () => {
    it('returns paginated results with default pagination', async () => {
      const rows = [
        createDbRestaurantRow({ id: 'id-1', name: 'Alpha' }),
        createDbRestaurantRow({ id: 'id-2', name: 'Beta' }),
      ];

      // Main query chain — terminal is range()
      const mainChain = createChainableMock('range', { data: rows, count: 2, error: null });

      // Offers count chain — terminal is gte()
      const offersChain = createChainableMock('gte', { data: [], error: null });

      const mockFromFn = vi.fn()
        .mockReturnValueOnce(mainChain)
        .mockReturnValueOnce(offersChain);

      mockedCreateClient.mockResolvedValue({ from: mockFromFn } as never);

      const result = await listRestaurants({});

      expect(result.restaurants).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.hasMore).toBe(false);
    });

    it('returns empty results when no restaurants match filters', async () => {
      const mainChain = createChainableMock('range', { data: [], count: 0, error: null });
      const offersChain = createChainableMock('gte', { data: [], error: null });

      const mockFromFn = vi.fn()
        .mockReturnValueOnce(mainChain)
        .mockReturnValueOnce(offersChain);

      mockedCreateClient.mockResolvedValue({ from: mockFromFn } as never);

      const result = await listRestaurants({
        priceLevels: ['premium'],
      });

      expect(result.restaurants).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('applies distance filter via RPC', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: [{ id: 'id-1', name: 'Nearby', distance_km: 1.5 }],
        error: null,
      });

      const mainChain = createChainableMock('range', {
        data: [createDbRestaurantRow({ id: 'id-1', name: 'Nearby' })],
        count: 1,
        error: null,
      });

      const offersChain = createChainableMock('gte', { data: [], error: null });

      const mockFromFn = vi.fn()
        .mockReturnValueOnce(mainChain)
        .mockReturnValueOnce(offersChain);

      mockedCreateClient.mockResolvedValue({ from: mockFromFn, rpc: mockRpc } as never);

      const result = await listRestaurants({
        distance: { radius: 5, from: { latitude: 52.23, longitude: 21.01 } },
      });

      expect(result.restaurants).toHaveLength(1);
      expect(result.restaurants[0].distanceKm).toBe(1.5);
      expect(mockRpc).toHaveBeenCalledWith('get_restaurants_within_radius', {
        user_lat: 52.23,
        user_lng: 21.01,
        radius_km: 5,
      });
    });

    it('returns empty results when distance RPC returns no restaurants', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null });

      mockedCreateClient.mockResolvedValue({ from: vi.fn(), rpc: mockRpc } as never);

      const result = await listRestaurants({
        distance: { radius: 1, from: { latitude: 52.23, longitude: 21.01 } },
      });

      expect(result.restaurants).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ==========================================================================
  // getRestaurant
  // ==========================================================================

  describe('getRestaurant', () => {
    it('returns restaurant with active offers count', async () => {
      const dbRow = createDbRestaurantRow();

      // Fetch restaurant chain
      const fetchChain = createChainableMock('single', { data: dbRow, error: null });

      // Count active offers chain — select with count/head, then eq, then gte
      const countChain: Record<string, unknown> = {};
      countChain.select = vi.fn().mockReturnValue(countChain);
      countChain.eq = vi.fn().mockReturnValue(countChain);
      countChain.gte = vi.fn().mockResolvedValue({ count: 3, error: null });

      const mockFromFn = vi.fn()
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(countChain);

      mockedCreateClient.mockResolvedValue({ from: mockFromFn } as never);

      const result = await getRestaurant('550e8400-e29b-41d4-a716-446655440000');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Restauracja Testowa');
      expect(result!.activeOffersCount).toBe(3);
      expect(result!.distanceKm).toBeNull();
    });

    it('returns null when restaurant not found', async () => {
      const fetchChain = createChainableMock('single', {
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      mockedCreateClient.mockResolvedValue({ from: vi.fn().mockReturnValue(fetchChain) } as never);

      const result = await getRestaurant('non-existent-id');

      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // searchRestaurants
  // ==========================================================================

  describe('searchRestaurants', () => {
    it('returns matching restaurants for valid query', async () => {
      const rows = [
        { id: 'id-1', name: 'Restauracja Polska', address: 'ul. Główna 1', cuisine_types: ['polska'] },
        { id: 'id-2', name: 'Restauracja Polka', address: null, cuisine_types: ['polska', 'wloska'] },
      ];

      const chain = createChainableMock('limit', { data: rows, error: null });
      mockedCreateClient.mockResolvedValue({ from: vi.fn().mockReturnValue(chain) } as never);

      const result = await searchRestaurants('Pol');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Restauracja Polska');
      expect(result[1].name).toBe('Restauracja Polka');
    });

    it('returns empty array for query shorter than 2 characters', async () => {
      const result = await searchRestaurants('P');

      expect(result).toEqual([]);
    });

    it('returns empty array for whitespace-only query', async () => {
      const result = await searchRestaurants('  ');

      expect(result).toEqual([]);
    });

    it('returns empty array on database error', async () => {
      const chain = createChainableMock('limit', { data: null, error: { message: 'DB error' } });
      mockedCreateClient.mockResolvedValue({ from: vi.fn().mockReturnValue(chain) } as never);

      const result = await searchRestaurants('Test');

      expect(result).toEqual([]);
    });
  });
});
