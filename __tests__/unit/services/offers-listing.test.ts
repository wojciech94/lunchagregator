import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listOffers } from '@/services/offers';
import type { OfferFilters } from '@/types/filters';

// Mock Supabase client
const mockRange = vi.fn();
const mockOrder = vi.fn(() => ({ range: mockRange }));
const mockOr = vi.fn(() => ({ order: mockOrder }));
const mockContains = vi.fn();
const mockIn = vi.fn();
const mockLte = vi.fn();
const mockGte = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockRpc = vi.fn();

const mockFrom = vi.fn(() => ({
  select: mockSelect,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      from: mockFrom,
      rpc: mockRpc,
    })
  ),
}));

// Helper to create a valid DB row
function createDbRow(overrides: Record<string, unknown> = {}) {
  const today = new Date().toISOString().split('T')[0];
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    dish_name: 'Pierogi ruskie',
    price: 25.0,
    currency: 'PLN',
    description: 'Tradycyjne pierogi z serem i ziemniakami',
    restaurant_name: 'Restauracja Polska',
    restaurant_address: 'ul. Główna 1, Warszawa',
    restaurant_location: null,
    available_date: today,
    cuisine_type: 'polska',
    dietary_tags: ['vegetarian'],
    allergens: ['gluten', 'mleko'],
    source_type: 'text',
    session_token: 'test-session-token',
    created_at: '2024-01-01T12:00:00Z',
    updated_at: '2024-01-01T12:00:00Z',
    ...overrides,
  };
}

describe('OfferService Listing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listOffers - standard query (no distance)', () => {
    function setupStandardQuery(data: Record<string, unknown>[], count: number) {
      // Chain: from -> select -> eq -> [filters] -> order -> range
      mockRange.mockResolvedValue({ data, error: null, count });
      mockOrder.mockReturnValue({ range: mockRange });

      // Build a chainable mock that supports all filter methods
      const chainable: Record<string, unknown> = {};
      chainable.eq = vi.fn(() => chainable);
      chainable.gte = vi.fn(() => chainable);
      chainable.lte = vi.fn(() => chainable);
      chainable.in = vi.fn(() => chainable);
      chainable.contains = vi.fn(() => chainable);
      chainable.or = vi.fn(() => chainable);
      chainable.order = vi.fn(() => chainable);
      chainable.range = vi.fn().mockResolvedValue({ data, error: null, count });

      mockSelect.mockReturnValue(chainable);

      return chainable;
    }

    it('returns offers for today with default pagination', async () => {
      const rows = [createDbRow(), createDbRow({ id: 'second-id', dish_name: 'Barszcz' })];
      const chain = setupStandardQuery(rows, 2);

      const filters: OfferFilters = {};
      const result = await listOffers(filters);

      expect(result.offers).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.hasMore).toBe(false);
      expect(mockFrom).toHaveBeenCalledWith('lunch_offers');
    });

    it('enforces max 50 per page limit', async () => {
      const chain = setupStandardQuery([], 0);

      const filters: OfferFilters = { limit: 100 };
      const result = await listOffers(filters);

      expect(result.limit).toBe(50);
    });

    it('applies pagination offset correctly', async () => {
      const chain = setupStandardQuery([], 0);

      const filters: OfferFilters = { page: 3, limit: 10 };
      const result = await listOffers(filters);

      expect(result.page).toBe(3);
      // offset should be (3-1)*10 = 20, range(20, 29)
      expect(chain.range).toHaveBeenCalledWith(20, 29);
    });

    it('applies price filter with min and max', async () => {
      const chain = setupStandardQuery([], 0);

      const filters: OfferFilters = { price: { min: 10, max: 30 } };
      await listOffers(filters);

      expect(chain.gte).toHaveBeenCalledWith('price', 10);
      expect(chain.lte).toHaveBeenCalledWith('price', 30);
    });

    it('applies cuisine type filter with OR logic', async () => {
      const chain = setupStandardQuery([], 0);

      const filters: OfferFilters = { cuisineTypes: ['polska', 'wloska'] };
      await listOffers(filters);

      expect(chain.in).toHaveBeenCalledWith('cuisine_type', ['polska', 'wloska']);
    });

    it('applies dietary tags filter with AND logic', async () => {
      const chain = setupStandardQuery([], 0);

      const filters: OfferFilters = { dietaryTags: ['vegetarian', 'gluten-free'] };
      await listOffers(filters);

      expect(chain.contains).toHaveBeenCalledWith('dietary_tags', ['vegetarian']);
      expect(chain.contains).toHaveBeenCalledWith('dietary_tags', ['gluten-free']);
    });

    it('applies search query with ilike on dish_name and description', async () => {
      const chain = setupStandardQuery([], 0);

      const filters: OfferFilters = { searchQuery: 'pierogi' };
      await listOffers(filters);

      expect(chain.or).toHaveBeenCalledWith(
        'dish_name.ilike.%pierogi%,description.ilike.%pierogi%'
      );
    });

    it('does not apply search for queries shorter than 2 characters', async () => {
      const chain = setupStandardQuery([], 0);

      const filters: OfferFilters = { searchQuery: 'a' };
      await listOffers(filters);

      expect(chain.or).not.toHaveBeenCalled();
    });

    it('applies price_asc sort', async () => {
      const chain = setupStandardQuery([], 0);

      const filters: OfferFilters = { sortBy: 'price_asc' };
      await listOffers(filters);

      expect(chain.order).toHaveBeenCalledWith('price', { ascending: true });
    });

    it('applies price_desc sort', async () => {
      const chain = setupStandardQuery([], 0);

      const filters: OfferFilters = { sortBy: 'price_desc' };
      await listOffers(filters);

      expect(chain.order).toHaveBeenCalledWith('price', { ascending: false });
    });

    it('applies newest sort', async () => {
      const chain = setupStandardQuery([], 0);

      const filters: OfferFilters = { sortBy: 'newest' };
      await listOffers(filters);

      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('defaults to alphabetical sort by restaurant_name when no location', async () => {
      const chain = setupStandardQuery([], 0);

      const filters: OfferFilters = {};
      await listOffers(filters);

      expect(chain.order).toHaveBeenCalledWith('restaurant_name', { ascending: true });
    });

    it('maps database rows to LunchOfferWithDistance correctly', async () => {
      const row = createDbRow();
      setupStandardQuery([row], 1);

      const result = await listOffers({});

      expect(result.offers[0]).toMatchObject({
        id: row.id,
        dishName: 'Pierogi ruskie',
        price: 25.0,
        currency: 'PLN',
        description: 'Tradycyjne pierogi z serem i ziemniakami',
        restaurantName: 'Restauracja Polska',
        cuisineType: 'polska',
        dietaryTags: ['vegetarian'],
        distanceKm: null,
      });
    });

    it('sets hasMore to true when more results exist', async () => {
      const rows = [createDbRow()];
      setupStandardQuery(rows, 100);

      const filters: OfferFilters = { page: 1, limit: 10 };
      const result = await listOffers(filters);

      expect(result.hasMore).toBe(true);
    });

    it('throws error on database failure', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            range: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Connection error' },
              count: null,
            }),
          })),
        })),
      });

      await expect(listOffers({})).rejects.toThrow('Failed to fetch offers');
    });
  });

  describe('listOffers - with distance (spatial query)', () => {
    it('uses RPC when distance filter is provided', async () => {
      const spatialResults = [
        { id: 'offer-1', dish_name: 'Pierogi', price: 25, description: 'Desc', restaurant_name: 'Rest', distance_km: 1.5 },
      ];

      mockRpc.mockResolvedValue({ data: spatialResults, error: null });

      // Mock the follow-up query for full records
      const chainable: Record<string, unknown> = {};
      chainable.eq = vi.fn(() => chainable);
      chainable.in = vi.fn(() => chainable);
      chainable.gte = vi.fn(() => chainable);
      chainable.lte = vi.fn(() => chainable);
      chainable.contains = vi.fn(() => chainable);
      chainable.or = vi.fn(() => chainable);
      mockSelect.mockReturnValue(chainable);

      const fullRow = createDbRow({ id: 'offer-1' });
      // The final query resolves with data
      (chainable.in as ReturnType<typeof vi.fn>).mockReturnValue({
        ...chainable,
        // Override the last call to resolve
      });

      // Simplify: make the chain resolve at the end
      const finalChain: Record<string, unknown> = {};
      finalChain.eq = vi.fn(() => finalChain);
      finalChain.in = vi.fn(() => finalChain);
      finalChain.gte = vi.fn(() => finalChain);
      finalChain.lte = vi.fn(() => finalChain);
      finalChain.contains = vi.fn(() => finalChain);
      finalChain.or = vi.fn(() => finalChain);
      // Make it thenable (resolves when awaited)
      Object.defineProperty(finalChain, 'then', {
        value: (resolve: (val: unknown) => void) => {
          resolve({ data: [fullRow], error: null, count: 1 });
        },
        enumerable: false,
      });

      mockSelect.mockReturnValue(finalChain);

      const filters: OfferFilters = {
        distance: { radius: 5, from: { latitude: 52.23, longitude: 21.01 } },
      };

      const result = await listOffers(filters);

      expect(mockRpc).toHaveBeenCalledWith('get_offers_within_radius', {
        user_lat: 52.23,
        user_lng: 21.01,
        radius_km: 5,
      });
      expect(result.offers[0].distanceKm).toBe(1.5);
    });

    it('returns empty result when no offers within radius', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });

      const filters: OfferFilters = {
        distance: { radius: 1, from: { latitude: 52.23, longitude: 21.01 } },
      };

      const result = await listOffers(filters);

      expect(result.offers).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('throws error on RPC failure', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC error' } });

      const filters: OfferFilters = {
        distance: { radius: 5, from: { latitude: 52.23, longitude: 21.01 } },
      };

      await expect(listOffers(filters)).rejects.toThrow('Failed to fetch offers within radius');
    });

    it('uses distance sort when userLocation provided with sortBy distance', async () => {
      const spatialResults = [
        { id: 'offer-1', dish_name: 'A', price: 25, description: '', restaurant_name: 'R1', distance_km: 3.0 },
        { id: 'offer-2', dish_name: 'B', price: 20, description: '', restaurant_name: 'R2', distance_km: 1.0 },
      ];

      mockRpc.mockResolvedValue({ data: spatialResults, error: null });

      const fullRows = [
        createDbRow({ id: 'offer-1', dish_name: 'A', price: 25 }),
        createDbRow({ id: 'offer-2', dish_name: 'B', price: 20 }),
      ];

      const finalChain: Record<string, unknown> = {};
      finalChain.eq = vi.fn(() => finalChain);
      finalChain.in = vi.fn(() => finalChain);
      finalChain.gte = vi.fn(() => finalChain);
      finalChain.lte = vi.fn(() => finalChain);
      finalChain.contains = vi.fn(() => finalChain);
      finalChain.or = vi.fn(() => finalChain);
      Object.defineProperty(finalChain, 'then', {
        value: (resolve: (val: unknown) => void) => {
          resolve({ data: fullRows, error: null, count: 2 });
        },
        enumerable: false,
      });

      mockSelect.mockReturnValue(finalChain);

      const filters: OfferFilters = { sortBy: 'distance' };
      const userLocation = { latitude: 52.23, longitude: 21.01 };

      const result = await listOffers(filters, userLocation);

      // Should be sorted by distance: offer-2 (1.0km) before offer-1 (3.0km)
      expect(result.offers[0].distanceKm).toBe(1.0);
      expect(result.offers[1].distanceKm).toBe(3.0);
    });
  });
});
