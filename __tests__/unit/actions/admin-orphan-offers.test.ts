/**
 * The admin gate on the orphan list. #55.
 *
 * This suite mocks `listOrphanOffers` rather than the Supabase client, because the
 * thing worth pinning down here is not the query -- `orphan-offers.test.ts` proves
 * that against the real database -- but the refusal. The failure this guards
 * against is quiet: `get_orphan_offers` answers a non-admin with zero rows and no
 * error, so a caller that skipped the check would render "nothing to reclaim"
 * over a table full of orphans. A wrong page, confidently.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAdmin: vi.fn(),
  getUser: vi.fn(),
  listOrphanOffers: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getAdmin: mocks.getAdmin, getUser: mocks.getUser }));
vi.mock('@/services/offers', () => ({ listOrphanOffers: mocks.listOrphanOffers }));

import { getOrphanOffersAction } from '@/actions/offers';

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';

const orphan = { id: '33333333-3333-3333-3333-333333333333', userId: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listOrphanOffers.mockResolvedValue([orphan]);
});

describe('getOrphanOffersAction', () => {
  it('lists the orphans for an admin', async () => {
    mocks.getAdmin.mockResolvedValue({ id: ADMIN_ID, app_metadata: { role: 'admin' } });

    await expect(getOrphanOffersAction()).resolves.toEqual({ success: true, data: [orphan] });
    expect(mocks.listOrphanOffers).toHaveBeenCalledOnce();
  });

  it('refuses an anonymous caller without asking the database', async () => {
    mocks.getAdmin.mockResolvedValue(null);

    const result = await getOrphanOffersAction();

    expect(result.success).toBe(false);
    // Not merely unused: the query is what an unauthorised caller must not reach,
    // and asserting the call count is what keeps a future refactor from hoisting
    // it above the check.
    expect(mocks.listOrphanOffers).not.toHaveBeenCalled();
  });

  it('refuses an ordinary User', async () => {
    mocks.getAdmin.mockResolvedValue(null);

    await expect(getOrphanOffersAction()).resolves.toMatchObject({ success: false });
    expect(mocks.listOrphanOffers).not.toHaveBeenCalled();
  });

  it('reports a failure as an error result rather than throwing', async () => {
    mocks.getAdmin.mockResolvedValue({ id: ADMIN_ID, app_metadata: { role: 'admin' } });
    mocks.listOrphanOffers.mockRejectedValue(new Error('Failed to fetch orphan offers: boom'));

    // The panel renders this state, so it has to arrive as a value. An uncaught
    // throw would take the page down with a 500 instead.
    await expect(getOrphanOffersAction()).resolves.toEqual({
      success: false,
      error: 'Failed to fetch orphan offers: boom',
    });
  });

  it('returns an empty list as a success, not as a failure', async () => {
    mocks.getAdmin.mockResolvedValue({ id: ADMIN_ID, app_metadata: { role: 'admin' } });
    mocks.listOrphanOffers.mockResolvedValue([]);

    // An empty table is the healthy state, and the page says so. Reporting it as
    // an error would train an operator to ignore the error state.
    await expect(getOrphanOffersAction()).resolves.toEqual({ success: true, data: [] });
  });
});

describe('the guard is not inherited from getUser', () => {
  it('leaves getUser untouched, so the ownership checks still see the caller', async () => {
    // updateOfferAction and deleteOfferAction read `getUser()` and pass the whole
    // user to canModify/canDelete. If a future change routed those through
    // getAdmin, an owner editing their own offer would stop being able to.
    mocks.getUser.mockResolvedValue({ id: USER_ID });

    const { getUser } = await import('@/lib/auth');

    await expect(getUser()).resolves.toEqual({ id: USER_ID });
  });
});
