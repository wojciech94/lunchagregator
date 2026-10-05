/**
 * Tests for `assignOffersToRestaurant` (Req 8.9 as amended by #74) -- the
 * attach flow behind the „Bez restauracji" bucket.
 *
 * The contract under test:
 * - **attach-when-null only**: an offer that already has a restaurant is
 *   skipped and reported; it is never re-linked and nothing is detached
 *   (the #18 line survives);
 * - the update touches exactly the own, unlinked offers;
 * - ownership itself is the action's gate -- this service trusts its caller
 *   for the restaurant and scopes the offers to the caller's own rows.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { assignOffersToRestaurant } from '@/services/offers';

const mockedCreateClient = vi.mocked(createClient);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440000';

interface StubOptions {
  /** Rows the scoped fetch returns (the caller's own offers, as RLS would). */
  offers?: Array<{ id: string; restaurant_id: string | null }>;
}

function stubClient(opts: StubOptions = {}) {
  const updateRows: Record<string, unknown>[] = [];
  const inCalls: Array<{ column: string; values: unknown }> = [];
  let updateCalled = false;

  const from = vi.fn((table: string) => {
    void table;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.in = (_column: string, values: unknown) => {
      inCalls.push({ column: _column, values });
      return chain;
    };
    chain.eq = () => chain;
    chain.update = (row: Record<string, unknown>) => {
      updateCalled = true;
      updateRows.push(row);
      return chain;
    };
    chain.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) =>
      Promise.resolve(
        updateCalled
          ? { data: null, error: null }
          : { data: opts.offers ?? [], error: null }
      ).then(resolve, reject);
    return chain;
  });

  mockedCreateClient.mockResolvedValue({ from } as never);
  return { updateRows, inCalls, isUpdateCalled: () => updateCalled };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('assignOffersToRestaurant: attach-when-null', () => {
  it('attaches the unlinked offers and reports the linked ones as skipped', async () => {
    const stub = stubClient({
      offers: [
        { id: 'o-1', restaurant_id: null },
        { id: 'o-2', restaurant_id: null },
        { id: 'o-3', restaurant_id: 'r-existing' },
      ],
    });

    const result = await assignOffersToRestaurant(
      ['o-1', 'o-2', 'o-3'],
      RESTAURANT_ID,
      USER_ID
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({ attached: 2, skippedAlreadyLinked: 1 });

    // The update carried the restaurant id and touched exactly the two
    // unlinked offers -- never the linked one.
    expect(stub.isUpdateCalled()).toBe(true);
    expect(stub.updateRows[0]?.restaurant_id).toBe(RESTAURANT_ID);
    const updateIn = stub.inCalls[stub.inCalls.length - 1];
    expect(updateIn.values).toEqual(['o-1', 'o-2']);
  });

  it('attaches nothing and skips the update when every offer is already linked', async () => {
    const stub = stubClient({
      offers: [{ id: 'o-1', restaurant_id: 'r-existing' }],
    });

    const result = await assignOffersToRestaurant(
      ['o-1'],
      RESTAURANT_ID,
      USER_ID
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({ attached: 0, skippedAlreadyLinked: 1 });
    expect(stub.isUpdateCalled()).toBe(false);
  });

  it('scopes to the caller’s own rows: foreign ids simply never come back', async () => {
    // The scoped fetch is the ownership layer here; a row the User does not
    // own does not come back from it, so it cannot be attached or leaked.
    const stub = stubClient({
      offers: [{ id: 'o-own', restaurant_id: null }],
    });

    const result = await assignOffersToRestaurant(
      ['o-own', 'o-foreign'],
      RESTAURANT_ID,
      USER_ID
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.attached).toBe(1);
    const updateIn = stub.inCalls[stub.inCalls.length - 1];
    expect(updateIn.values).toEqual(['o-own']);
  });
});
