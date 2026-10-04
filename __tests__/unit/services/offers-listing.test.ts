/**
 * `listOffers` against the single RPC. #19 and #20.
 *
 * Rewritten because the assertions were about query *shape* -- `.range(20, 29)`,
 * `.order('price', {ascending: true})`, a chainable mock built to answer each
 * Supabase builder call. That shape is what #20 deleted: ordering, slicing and
 * filtering are the database's job now, so a test that mocks the builder and
 * asserts on it proves nothing about the query that runs.
 *
 * What is left to assert at this layer is what the function itself decides:
 * which RPC is called, with what parameters, and how the result is mapped.
 * Whether the SQL honours those parameters is verified against PostGIS in
 * __tests__/db/filtered-query.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listOffers } from '@/services/offers';
import type { OfferFilters } from '@/types/filters';

const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockCountChain = {
  eq: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  in: vi.fn(),
  contains: vi.fn(),
  or: vi.fn(),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      from: mockFrom,
      rpc: mockRpc,
    }),
  ),
}));

const WARSAW = { latitude: 52.2297, longitude: 21.0122 };

function createDbRow(overrides: Record<string, unknown> = {}) {
  const today = new Date().toISOString().split('T')[0];
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    dish_name: 'Pierogi ruskie',
    items: [],
    price: 25.0,
    currency: 'PLN',
    description: 'Tradycyjne pierogi z serem i ziemniakami',
    restaurant_name: 'Restauracja Polska',
    restaurant_address: 'ul. Główna 1, Warszawa',
    // WKB hex, which is what PostgREST returns for a geography column. A WKT
    // string here would be a shape the server does not produce.
    restaurant_location:
      '0101000020E6100000DE02098A1F03354013F241CF661D4A40',
    available_date: today,
    cuisine_type: 'polska',
    dietary_tags: ['vegetarian'],
    allergens: ['gluten', 'mleko'],
    source_type: 'text',
    user_id: null,
    session_token: null,
    created_at: '2024-01-01T12:00:00Z',
    updated_at: '2024-01-01T12:00:00Z',
    distance_km: null,
    ...overrides,
  };
}

/**
 * A chainable stand-in for the head count query.
 *
 * Built rather than hand-written per test because the chain has to satisfy
 * `.eq().gte().lte().in().contains().or()` in any order the filters appear, and
 * a mock missing one method fails with "is not a function" rather than the
 * assertion the test is about.
 */
function setupCount(result: { count: number | null; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const method of ['eq', 'gte', 'lte', 'in', 'contains', 'or'] as const) {
    chain[method] = vi.fn(() => chain);
  }
  // Awaited by the service, so the chain has to be thenable.
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return chain;
}

/** The RPC returns rows; the count query returns a head count. */
function setup(rows: Record<string, unknown>[], count: number) {
  mockRpc.mockResolvedValue({ data: rows, error: null });
  mockFrom.mockReturnValue({ select: () => setupCount({ count, error: null }) });
}

/** The params of the nth get_offers_filtered call. */
function rpcArgs(index = 0): Record<string, unknown> {
  return mockRpc.mock.calls[index][1];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listOffers calls the single RPC', () => {
  it('uses get_offers_filtered and nothing else', async () => {
    setup([createDbRow()], 1);

    await listOffers({});

    const fnNames = mockRpc.mock.calls.map((call) => call[0]);
    expect(fnNames).toContain('get_offers_filtered');
    expect(fnNames).not.toContain('get_offers_within_radius');
  });

  it('defaults to today, 50 per page, no origin', async () => {
    setup([], 0);

    await listOffers({});

    expect(rpcArgs()).toMatchObject({
      p_date: new Date().toISOString().split('T')[0],
      p_limit: 50,
      p_offset: 0,
      p_user_lat: null,
      p_user_lng: null,
      p_radius_km: null,
    });
  });

  it('caps the page at 50 even when asked for more', async () => {
    setup([], 0);

    const result = await listOffers({ limit: 100 });

    // Requirement 1.1. Capped here as well as in the schema, because the schema
    // default is not the only thing that can reach this.
    expect(result.limit).toBe(50);
    expect(rpcArgs().p_limit).toBe(50);
  });

  it('computes the offset from the page', async () => {
    setup([], 0);

    const result = await listOffers({ page: 3, limit: 10 });

    expect(result.page).toBe(3);
    expect(rpcArgs().p_offset).toBe(20);
    expect(rpcArgs().p_limit).toBe(10);
  });

  it('passes the requested date through', async () => {
    setup([], 0);

    await listOffers({ date: '2030-01-01' });

    // The old distance function hardcoded CURRENT_DATE and returned nothing for
    // any other day.
    expect(rpcArgs().p_date).toBe('2030-01-01');
  });

  it('forwards every filter instead of applying it afterwards', async () => {
    setup([], 0);

    await listOffers({
      price: { min: 10, max: 40 },
      cuisineTypes: ['polska', 'wloska'],
      dietaryTags: ['vegan', 'gluten-free'],
      searchQuery: 'pierogi',
      sortBy: 'price_asc',
    });

    expect(rpcArgs()).toMatchObject({
      p_price_min: 10,
      p_price_max: 40,
      p_cuisine_types: ['polska', 'wloska'],
      p_dietary_tags: ['vegan', 'gluten-free'],
      p_search_query: 'pierogi',
      p_sort_by: 'price_asc',
    });
  });

  it('sends null for absent filters rather than omitting them', async () => {
    setup([], 0);

    await listOffers({});

    expect(rpcArgs()).toMatchObject({
      p_price_min: null,
      p_price_max: null,
      p_cuisine_types: null,
      p_dietary_tags: null,
      p_search_query: null,
    });
  });
});

describe('listOffers and the radius', () => {
  it('sends the origin the User chose in the slider', async () => {
    setup([], 0);

    await listOffers({ distance: { radius: 5, from: WARSAW } });

    expect(rpcArgs()).toMatchObject({
      p_user_lat: WARSAW.latitude,
      p_user_lng: WARSAW.longitude,
      p_radius_km: 5,
    });
  });

  it('falls back to the browser position when there is no slider origin', async () => {
    setup([], 0);

    await listOffers({ sortBy: 'distance' }, WARSAW);

    expect(rpcArgs()).toMatchObject({
      p_user_lat: WARSAW.latitude,
      p_user_lng: WARSAW.longitude,
      // No radius asked for, so the distance is measured but not bounded.
      p_radius_km: null,
    });
  });

  it('sends no radius when there is no location to measure from', async () => {
    setup([], 0);

    await listOffers({ distance: { radius: 5, from: WARSAW } });
    // And again without one: the slider always has a radius, and first paint
    // has no location yet.
    mockRpc.mockClear();
    setup([], 0);

    await listOffers({});

    expect(rpcArgs().p_radius_km).toBeNull();
  });
});

describe('listOffers maps the rows', () => {
  it('reads a full row off the RPC result', async () => {
    setup([createDbRow()], 1);

    const result = await listOffers({});

    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({
      dishName: 'Pierogi ruskie',
      price: 25,
      currency: 'PLN',
      restaurantName: 'Restauracja Polska',
      cuisineType: 'polska',
      dietaryTags: ['vegetarian'],
      allergens: ['gluten', 'mleko'],
    });
  });

  it('passes distance_km through as the server computed it', async () => {
    setup([createDbRow({ distance_km: 1.4 })], 1);

    const result = await listOffers({}, WARSAW);

    expect(result.offers[0].distanceKm).toBe(1.4);
  });

  it('reports a missing distance as null rather than zero', async () => {
    // Absent location is a presentation state, not a distance of zero. #21
    // removes the component-side rewrites that used to fake this.
    setup([createDbRow({ distance_km: null })], 1);

    const result = await listOffers({});

    expect(result.offers[0].distanceKm).toBeNull();
  });

  it('decodes the geography column the way PostgREST sends it', async () => {
    setup([createDbRow()], 1);

    const result = await listOffers({});

    // Not null: the RPC returns WKB hex, and the decoder reads it. #43 fixed
    // this; it is asserted here because listOffers is where offers get mapped.
    expect(result.offers[0].restaurantLocation).toEqual({
      latitude: 52.2297,
      longitude: 21.0122,
    });
  });
});

describe('listOffers pagination', () => {
  it('reports the total from the count query', async () => {
    setup([createDbRow()], 42);

    const result = await listOffers({});

    expect(result.total).toBe(42);
  });

  it('sets hasMore from the total, not from the page length', async () => {
    setup([createDbRow(), createDbRow({ id: 'b' })], 42);

    const result = await listOffers({});

    expect(result.hasMore).toBe(true);
  });

  it('clears hasMore on the last page', async () => {
    setup([createDbRow()], 1);

    const result = await listOffers({});

    expect(result.hasMore).toBe(false);
  });
});

describe('listOffers failures', () => {
  it('throws when the RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(listOffers({})).rejects.toThrow(/boom/);
  });

  it('throws when the count query fails', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    mockFrom.mockReturnValue({
      select: () => setupCount({ count: null, error: { message: 'count boom' } }),
    });

    await expect(listOffers({})).rejects.toThrow(/count boom/);
  });
});