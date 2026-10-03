import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/auth', () => ({ getUser: mocks.getUser }));

import { createOfferAction, updateOfferAction } from '@/actions/offers';

const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const OFFER_ID = '550e8400-e29b-41d4-a716-446655440000';
const input = { dishName: 'Zupa dnia', price: 25, restaurantName: 'Lunch Bar', availableDate: new Date().toISOString().slice(0, 10), sourceType: 'text' as const };
const dbOffer = { id: OFFER_ID, dish_name: input.dishName, price: input.price, restaurant_name: input.restaurantName, available_date: input.availableDate, source_type: input.sourceType, items: [], currency: 'PLN', description: null, restaurant_id: null, restaurant_address: null, restaurant_location: null, cuisine_type: null, dietary_tags: [], allergens: [], user_id: OWNER_ID, session_token: null, created_at: '', updated_at: '' };

/** Validates: Requirements 5.2, 5.3, 5.4, 5.5 */
describe('authenticated offer ownership regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ id: OWNER_ID });
  });

  it('allows its creator to update an offer retrieved from its persisted user_id', async () => {
    const createQuery = { insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: dbOffer, error: null }) })) })) };
    const readQuery = { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: dbOffer, error: null }) })) })) };
    const updateQuery = { update: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { ...dbOffer, dish_name: 'Nowa zupa' }, error: null }) })) })) })) };
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => createQuery) }).mockResolvedValueOnce({ from: vi.fn(() => readQuery) }).mockResolvedValueOnce({ from: vi.fn(() => updateQuery) });

    await expect(createOfferAction(input)).resolves.toMatchObject({ success: true, data: { userId: OWNER_ID } });
    expect(createQuery.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: OWNER_ID }));
    await expect(updateOfferAction(OFFER_ID, { dishName: 'Nowa zupa' })).resolves.toMatchObject({ success: true, data: { dishName: 'Nowa zupa' } });
    expect(updateQuery.update).toHaveBeenCalled();
  });
});