/**
 * Tests for `listAdminOffers` (#76): the operator's queue is a direct query
 * over every offer, newest first -- not the public listing, which answers
 * "what can I eat today, near me" and left the panel showing a single
 * today-row.
 *
 * The contract under test:
 * - a non-admin is refused with `rows: null` (a null list is an error, an
 *   empty list is "nothing to do" -- the panel never confuses them);
 * - the non-orphan path passes the rows through and maps the exact count;
 * - `partial` is `total > rows.length`, so the page can say "first N of X"
 *   without implying it showed everything.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAdmin: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getAdmin: mocks.getAdmin }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { listAdminOffers } from '@/actions/admin';

const mockedCreateClient = vi.mocked(createClient);

const ADMIN_ID = '22222222-2222-4222-8222-222222222222';

interface StubOptions {
  /** Raw database rows (snake_case), exactly what `select('*')` returns. */
  rows?: Array<Record<string, unknown>>;
  count?: number | null;
  error?: { message: string } | null;
}

function stubClient(opts: StubOptions = {}) {
  const from = vi.fn((table: string) => {
    void table;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.order = () => chain;
    chain.limit = () =>
      Promise.resolve({
        data: opts.rows ?? [],
        count: opts.count ?? null,
        error: opts.error ?? null,
      });
    return chain;
  });

  mockedCreateClient.mockResolvedValue({ from } as never);
}

/** A raw row as the database stores it -- snake_case columns. */
function dbRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'o-1',
    dish_name: 'Kotlet schabowy',
    items: [],
    price: 24.9,
    currency: 'PLN',
    description: null,
    restaurant_id: null,
    restaurant_name: 'Bar Mleko',
    restaurant_address: 'Marszałkowska 10, Warszawa',
    restaurant_location: null,
    available_date: '2026-10-06',
    cuisine_type: null,
    dietary_tags: [],
    allergens: [],
    source_type: 'photo',
    user_id: null,
    session_token: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAdmin.mockResolvedValue({ id: ADMIN_ID, email: 'admin@test.pl' });
});

describe('listAdminOffers (#76): the queue sees everything', () => {
  it('refuses a non-admin with a null list, never an empty one', async () => {
    mocks.getAdmin.mockResolvedValue(null);

    const result = await listAdminOffers();

    expect(result.rows).toBeNull();
    expect(result.error).toBe('Brak uprawnień');
  });

  it('returns MAPPED offers -- camelCase fields the panel can render (#81)', async () => {
    // The #79 regression: raw snake_case rows reached the panel, and
    // `OrphanOfferRow` -- which reads `offer.dishName`, `offer.restaurantName`
    // -- rendered empty records.
    stubClient({
      rows: [dbRow(), dbRow({ id: 'o-2', dish_name: 'Pierogi', available_date: '2026-09-20' })],
      count: 2,
    });

    const result = await listAdminOffers();

    expect(result.rows).toHaveLength(2);
    const [first] = result.rows as Array<{ dishName?: string; restaurantName?: string; price?: number }>;
    expect(first?.dishName).toBe('Kotlet schabowy');
    expect(first?.restaurantName).toBe('Bar Mleko');
    expect(first?.price).toBe(24.9);
    expect(result.total).toBe(2);
    expect(result.partial).toBe(false);
  });

  it('marks the list partial when the exact count exceeds the cap', async () => {
    stubClient({ rows: [dbRow()], count: 250 });

    const result = await listAdminOffers();

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(250);
    expect(result.partial).toBe(true);
  });

  it('reports a failed query as null rows, not an empty list', async () => {
    stubClient({ error: { message: 'connection refused' } });

    const result = await listAdminOffers();

    expect(result.rows).toBeNull();
    expect(result.error).toMatch(/connection refused/);
  });
});
