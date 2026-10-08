import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), single: vi.fn(), create: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getAdmin: mocks.admin }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: () => ({
  select: () => ({ eq: () => ({ single: mocks.single }) }),
}) }) }));
vi.mock('@/services/offers', () => ({ createOffer: mocks.create }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
import { publishLunchImport } from './publish-lunch-import';
import { createImportReview } from '@/services/lunch-import/receipt';
import { getImportSource } from '@/lib/lunch-import/sources';

const restaurant = { id: '1070afce-ff35-4861-b940-f4eb783b9e40', name: 'Sofa Lounge & Restaurant', address: 'al. Paderewskiego 35, Wrocław' };
beforeEach(() => {
  vi.stubEnv('SOFA_IMPORT_RESTAURANT_ID', restaurant.id);
  vi.stubEnv('LUNCH_IMPORT_SIGNING_SECRET', 'test-only-012345678901234567890123456789');
  mocks.admin.mockResolvedValue({ id: 'admin-id' });
  mocks.single.mockResolvedValue({ data: restaurant, error: null });
  mocks.create.mockResolvedValue({ success: true, data: { id: 'offer-id' } });
});
afterEach(() => vi.unstubAllEnvs());
function input() {
  const review = createImportReview(getImportSource('sofa')!, new Date().toISOString(), [{ name: 'Set 1', price: 31 }, { name: 'Set 2', price: 32 }])!;
  return { receipt: review.receipt, availableDate: new Date().toISOString().slice(0, 10), confirmed: true,
    dishes: review.dishes.map(dish => ({ itemKey: dish.itemKey, dishName: dish.name, price: dish.price, items: [] })) };
}
describe('approved import publication', () => {
  it('refuses non-admins, missing approval, invalid/past dates and missing prices before writes', async () => {
    mocks.admin.mockResolvedValueOnce(null);
    expect((await publishLunchImport(input())).success).toBe(false);
    for (const patch of [{ confirmed: false }, { availableDate: '2026-02-30' }, { availableDate: '2000-01-01' },
      { dishes: [{ ...input().dishes[0], price: null }] }, { dishes: [{ ...input().dishes[0], price: 31.005 }] }]) {
      expect((await publishLunchImport({ ...input(), ...patch })).success).toBe(false);
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('refuses forged identities, tampered receipts and changed restaurants', async () => {
    const data = input();
    expect((await publishLunchImport({ ...data, receipt: `x${data.receipt}` })).success).toBe(false);
    expect((await publishLunchImport({ ...data, dishes: [data.dishes[0], data.dishes[0]] })).success).toBe(false);
    expect((await publishLunchImport({ ...data, dishes: [{ ...data.dishes[0], itemKey: 'f'.repeat(64) }] })).success).toBe(false);
    mocks.single.mockResolvedValueOnce({ data: { ...restaurant, address: 'Other branch' }, error: null });
    expect((await publishLunchImport(data)).success).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('reports partial saves and existing offers, retaining source keys after corrections', async () => {
    const data = input(); data.dishes[0].dishName = 'Corrected dish';
    mocks.create.mockResolvedValueOnce({ success: true, data: { id: 'existing-offer' }, alreadyImported: true, locationWarning: true });
    mocks.create.mockRejectedValueOnce(new Error('network'));
    const result = await publishLunchImport(data);
    expect(result).toEqual({ success: true, data: { saved: [{ itemKey: data.dishes[0].itemKey, offerId: 'existing-offer', existing: true, missingCoordinates: true }],
      failed: [{ itemKey: data.dishes[1].itemKey, error: 'Nie udało się zapisać pozycji. Ponów tylko nieudane pozycje.' }] } });
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ restaurantId: restaurant.id, dishName: 'Corrected dish', dietaryTags: [], allergens: [], cuisineType: null });
    expect(mocks.create.mock.calls[0][2]).toMatchObject({ inferCuisine: false, import: { itemKey: data.dishes[0].itemKey } });
    mocks.create.mockClear();
    await publishLunchImport({ ...data, dishes: [data.dishes[1]] });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
