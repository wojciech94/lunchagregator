/**
 * `getOfferWithAccessAction`: the permission the edit and delete pages render
 * from. #55.
 *
 * Those two pages are client components, so they cannot ask who is asking --
 * `getUser()` reads `next/headers` and importing it there fails the production
 * build. This action is the channel, which makes it the single place where "may
 * this caller modify this record" is decided for the UI.
 *
 * `canModify` and `canDelete` are the real predicates from `@/lib/ownership`,
 * unmocked, because the whole point is that this action widens them for an admin
 * exactly as `updateOfferAction` and `deleteOfferAction` do. A test that mocked
 * them would pass with the admin branch deleted.
 *
 * What this does not do is enforce. The checks inside `updateOfferAction` and
 * `deleteOfferAction` remain the only thing between a request and a mutation;
 * this tells the reader what to expect, one step earlier. That is why the refusals
 * here are `false` rather than errors -- "you may not" is a different answer from
 * "this does not exist", and the pages render the first as a refusal and the
 * second as a 404.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getOffer: vi.fn() }));

vi.mock('@/lib/auth', () => ({ getUser: mocks.getUser, getAdmin: vi.fn() }));
vi.mock('@/services/offers', () => ({
  getOffer: mocks.getOffer,
  listOrphanOffers: vi.fn(),
}));

import { getOfferWithAccessAction } from '@/actions/offers';

const OFFER_ID = '33333333-3333-3333-3333-333333333333';
const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const STRANGER_ID = '22222222-2222-2222-2222-222222222666';

const ADMIN = { id: STRANGER_ID, app_metadata: { role: 'admin' } };

function owned(userId: string | null) {
  return {
    success: true as const,
    data: { id: OFFER_ID, dishName: 'Rosół', userId, price: 18.5, currency: 'PLN' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOffer.mockResolvedValue(owned(OWNER_ID));
});

describe('the owner of a record', () => {
  it('may modify and delete it', async () => {
    mocks.getUser.mockResolvedValue({ id: OWNER_ID });

    await expect(getOfferWithAccessAction(OFFER_ID)).resolves.toMatchObject({
      success: true,
      data: { canModify: true, canDelete: true },
    });
  });
});

describe('an ordinary User on somebody else\'s record', () => {
  it('may do neither, and that is a success rather than an error', async () => {
    mocks.getUser.mockResolvedValue({ id: STRANGER_ID });

    const result = await getOfferWithAccessAction(OFFER_ID);

    expect(result).toMatchObject({ success: true, data: { canModify: false, canDelete: false } });
    // The record still comes back. Refusing to describe it would make "you may
    // not" and "it is not there" the same answer, and would leak which ids are
    // real to anybody who cared to ask.
    expect(result.success && result.data.offer.id).toBe(OFFER_ID);
  });
});

describe('an anonymous caller', () => {
  it('may do neither', async () => {
    mocks.getUser.mockResolvedValue(null);

    await expect(getOfferWithAccessAction(OFFER_ID)).resolves.toMatchObject({
      success: true,
      data: { canModify: false, canDelete: false },
    });
  });
});

describe('an admin', () => {
  it('may modify and delete a record owned by somebody else', async () => {
    mocks.getUser.mockResolvedValue(ADMIN);

    await expect(getOfferWithAccessAction(OFFER_ID)).resolves.toMatchObject({
      success: true,
      data: { canModify: true, canDelete: true },
    });
  });

  it('may modify and delete a record with no owner', async () => {
    // The case the admin panel exists for. `checkOwnership` returns false for a
    // null record owner by design, so without the admin branch this offer would
    // be permanently unmanageable -- which is the defect #54 closed and the one
    // these pages would otherwise still be hiding.
    mocks.getUser.mockResolvedValue(ADMIN);
    mocks.getOffer.mockResolvedValue(owned(null));

    await expect(getOfferWithAccessAction(OFFER_ID)).resolves.toMatchObject({
      success: true,
      data: { offer: { userId: null }, canModify: true, canDelete: true },
    });
  });

  it('does not become the owner by looking', async () => {
    mocks.getUser.mockResolvedValue(ADMIN);
    mocks.getOffer.mockResolvedValue(owned(null));

    const result = await getOfferWithAccessAction(OFFER_ID);

    // Reading a record is not claiming it. Reassigning user_id here would
    // transfer property as a side effect of a correction.
    expect(result.success && result.data.offer.userId).toBeNull();
  });
});

describe('failure', () => {
  it('passes a missing offer through as not found', async () => {
    mocks.getUser.mockResolvedValue({ id: OWNER_ID });
    mocks.getOffer.mockResolvedValue({ success: false, error: 'Offer not found' });

    await expect(getOfferWithAccessAction(OFFER_ID)).resolves.toEqual({
      success: false,
      error: 'Offer not found',
    });
  });

  it('rejects an id that is not a string', async () => {
    // Checked before the query, so a malformed id never reaches PostgREST.
    await expect(getOfferWithAccessAction('')).resolves.toEqual({
      success: false,
      error: 'Invalid offer ID',
    });
    expect(mocks.getOffer).not.toHaveBeenCalled();
  });

  it('reports a thrown error as a value', async () => {
    mocks.getUser.mockResolvedValue({ id: OWNER_ID });
    mocks.getOffer.mockRejectedValue(new Error('network down'));

    // These pages render the failure, so it has to arrive as a value rather than
    // an uncaught rejection.
    await expect(getOfferWithAccessAction(OFFER_ID)).resolves.toEqual({
      success: false,
      error: 'network down',
    });
  });
});
