import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getUser: vi.fn() }));
vi.mock('@/services/geocoding', () => ({ geocodeAddress: vi.fn() }));
vi.mock('@/services/offers', () => ({
  listOffers: vi.fn(),
  getOffer: vi.fn(),
  getOffersByRestaurant: vi.fn(),
  createOffer: vi.fn(),
  updateOffer: vi.fn(),
  deleteOffer: vi.fn(),
}));

import { getUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { deleteRestaurant, updateRestaurant } from '@/actions/restaurants';
import {
  deleteOfferAction,
  updateOfferAction,
} from '@/actions/offers';
import {
  deleteOffer,
  getOffer,
  updateOffer,
} from '@/services/offers';

const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_USER_ID = '22222222-2222-2222-2222-222222222222';
const RESOURCE_ID = '550e8400-e29b-41d4-a716-446655440000';

const mockedGetUser = vi.mocked(getUser);
const mockedCreateClient = vi.mocked(createClient);
const mockedGetOffer = vi.mocked(getOffer);
const mockedUpdateOffer = vi.mocked(updateOffer);
const mockedDeleteOffer = vi.mocked(deleteOffer);

function restaurantRow(userId: string | null) {
  return {
    id: RESOURCE_ID,
    name: 'Restauracja Testowa',
    description: null,
    address: 'ul. Testowa 1, Warszawa',
    location: null,
    price_level: null,
    lunch_hours_start: null,
    lunch_hours_end: null,
    cuisine_types: [],
    phone_number: null,
    website_url: null,
    session_token: null,
    user_id: userId,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  };
}

function readChain(result: unknown) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.single.mockResolvedValue(result);
  return chain;
}

function restaurantUpdateChain(result: unknown) {
  const chain = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
  };
  chain.update.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.single.mockResolvedValue(result);
  return chain;
}

function emptyAssociatedOffersChain() {
  const chain = { select: vi.fn(), eq: vi.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockResolvedValue({ data: [], error: null });
  return chain;
}

function restaurantDeleteChain() {
  const chain = { delete: vi.fn(), eq: vi.fn() };
  chain.delete.mockReturnValue(chain);
  chain.eq.mockResolvedValue({ error: null });
  return chain;
}

function offerResult(userId: string | null) {
  return { success: true, data: { id: RESOURCE_ID, userId } } as never;
}

/** Validates: Requirements 4.5, 5.3, 5.4, 5.5 */
describe('resource mutation authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUser.mockResolvedValue({ id: OWNER_ID } as never);
  });

  describe('restaurant mutations', () => {
    it('allows the owner to update a restaurant', async () => {
      const existing = restaurantRow(OWNER_ID);
      const updated = restaurantRow(OWNER_ID);
      const fetch = readChain({ data: existing, error: null });
      const write = restaurantUpdateChain({ data: updated, error: null });
      const from = vi.fn().mockReturnValueOnce(fetch).mockReturnValueOnce(write);
      mockedCreateClient.mockResolvedValue({ from } as never);

      await expect(updateRestaurant(RESOURCE_ID, { name: 'Nowa Nazwa' })).resolves.toMatchObject({
        success: true,
      });
      expect(write.update).toHaveBeenCalledWith({ name: 'Nowa Nazwa' });
    });

    it('allows the owner to delete a restaurant', async () => {
      const fetch = readChain({ data: restaurantRow(OWNER_ID), error: null });
      const offers = emptyAssociatedOffersChain();
      const remove = restaurantDeleteChain();
      const from = vi.fn()
        .mockReturnValueOnce(fetch)
        .mockReturnValueOnce(offers)
        .mockReturnValueOnce(remove);
      mockedCreateClient.mockResolvedValue({ from } as never);

      await expect(deleteRestaurant(RESOURCE_ID)).resolves.toEqual({ success: true, data: undefined });
      expect(remove.delete).toHaveBeenCalledOnce();
      expect(remove.eq).toHaveBeenCalledWith('id', RESOURCE_ID);
    });

    it.each([
      ['another user', OTHER_USER_ID],
      ['an unmigrated record', null],
    ])('rejects restaurant mutations for %s without writing', async (_case, recordUserId) => {
      const fetch = readChain({ data: restaurantRow(recordUserId), error: null });
      const from = vi.fn().mockReturnValue(fetch);
      mockedCreateClient.mockResolvedValue({ from } as never);

      await expect(updateRestaurant(RESOURCE_ID, { name: 'Nowa Nazwa' })).resolves.toEqual({
        success: false,
        error: 'Brak uprawnień do tej operacji',
      });
      await expect(deleteRestaurant(RESOURCE_ID)).resolves.toEqual({
        success: false,
        error: 'Brak uprawnień do tej operacji',
      });
      expect(from).toHaveBeenCalledTimes(2);
    });

    it.each(['update', 'delete'] as const)('does not write when restaurant fetch fails before %s', async (mutation) => {
      const fetch = readChain({ data: null, error: { message: 'Database unavailable' } });
      const from = vi.fn().mockReturnValue(fetch);
      mockedCreateClient.mockResolvedValue({ from } as never);

      const result = mutation === 'update'
        ? await updateRestaurant(RESOURCE_ID, { name: 'Nowa Nazwa' })
        : await deleteRestaurant(RESOURCE_ID);

      expect(result).toEqual({ success: false, error: 'Nie znaleziono restauracji' });
      expect(from).toHaveBeenCalledOnce();
    });
  });

  describe('offer mutations', () => {
    it('allows the owner to update and delete an offer', async () => {
      mockedGetOffer.mockResolvedValue(offerResult(OWNER_ID));
      mockedUpdateOffer.mockResolvedValue({ success: true, data: { id: RESOURCE_ID } } as never);
      mockedDeleteOffer.mockResolvedValue({ success: true, data: undefined });

      await expect(updateOfferAction(RESOURCE_ID, { dishName: 'Nowe danie' })).resolves.toMatchObject({
        success: true,
      });
      await expect(deleteOfferAction(RESOURCE_ID)).resolves.toEqual({ success: true, data: undefined });
      expect(mockedUpdateOffer).toHaveBeenCalledWith(RESOURCE_ID, { dishName: 'Nowe danie' });
      expect(mockedDeleteOffer).toHaveBeenCalledWith(RESOURCE_ID);
    });

    it.each([
      ['another user', OTHER_USER_ID],
      ['an unmigrated record', null],
    ])('rejects offer mutations for %s without writing', async (_case, recordUserId) => {
      mockedGetOffer.mockResolvedValue(offerResult(recordUserId));

      await expect(updateOfferAction(RESOURCE_ID, { dishName: 'Nowe danie' })).resolves.toEqual({
        success: false,
        error: 'Brak uprawnień do tej operacji',
      });
      await expect(deleteOfferAction(RESOURCE_ID)).resolves.toEqual({
        success: false,
        error: 'Brak uprawnień do tej operacji',
      });
      expect(mockedUpdateOffer).not.toHaveBeenCalled();
      expect(mockedDeleteOffer).not.toHaveBeenCalled();
    });

    it.each([
      ['a failed fetch', () => mockedGetOffer.mockResolvedValue({ success: false, error: 'Fetch failed' } as never)],
      ['a thrown system error', () => mockedGetOffer.mockRejectedValue(new Error('Database unavailable'))],
    ])('does not write offers after %s', async (_case, arrangeFailure) => {
      arrangeFailure();

      await expect(updateOfferAction(RESOURCE_ID, { dishName: 'Nowe danie' })).resolves.toMatchObject({
        success: false,
      });
      await expect(deleteOfferAction(RESOURCE_ID)).resolves.toMatchObject({ success: false });
      expect(mockedUpdateOffer).not.toHaveBeenCalled();
      expect(mockedDeleteOffer).not.toHaveBeenCalled();
    });
  });

  it('rejects unauthenticated mutations before any database or service write', async () => {
    mockedGetUser.mockResolvedValue(null);

    await expect(updateRestaurant(RESOURCE_ID, { name: 'Nowa Nazwa' })).resolves.toEqual({
      success: false,
      error: 'Brak autoryzacji',
    });
    await expect(deleteRestaurant(RESOURCE_ID)).resolves.toEqual({
      success: false,
      error: 'Brak autoryzacji',
    });
    await expect(updateOfferAction(RESOURCE_ID, { dishName: 'Nowe danie' })).resolves.toEqual({
      success: false,
      error: 'Brak autoryzacji',
    });
    await expect(deleteOfferAction(RESOURCE_ID)).resolves.toEqual({
      success: false,
      error: 'Brak autoryzacji',
    });
    expect(mockedCreateClient).not.toHaveBeenCalled();
    expect(mockedGetOffer).not.toHaveBeenCalled();
    expect(mockedUpdateOffer).not.toHaveBeenCalled();
    expect(mockedDeleteOffer).not.toHaveBeenCalled();
  });
});
