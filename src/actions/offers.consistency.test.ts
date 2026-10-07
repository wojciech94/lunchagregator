import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), createClient: vi.fn(), renew: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/services/offers', () => ({ renewRestaurantMenu: mocks.renew }));
import { renewMenuAction } from './offers';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.renew.mockResolvedValue({ success: true, data: { created: 1 } });
});
describe('renewal application authorization independent of RLS', () => {
  it('rejects a visitor before looking up the restaurant', async () => {
    mocks.getUser.mockResolvedValue(null);
    expect(await renewMenuAction('restaurant')).toMatchObject({ success: false });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.renew).not.toHaveBeenCalled();
  });
  it.each([
    { name: 'owner', actor: { id: 'owner' }, row: { user_id: 'owner' }, allowed: true },
    { name: 'admin', actor: { id: 'admin', app_metadata: { role: 'admin' } }, row: { user_id: 'owner' }, allowed: true },
    { name: 'other user', actor: { id: 'other' }, row: { user_id: 'owner' }, allowed: false },
    { name: 'missing restaurant', actor: { id: 'owner' }, row: null, allowed: false },
    { name: 'unowned restaurant', actor: { id: 'owner' }, row: { user_id: null }, allowed: false },
  ])('$name access', async ({ actor, row, allowed }) => {
    mocks.getUser.mockResolvedValue(actor);
    const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn().mockResolvedValue({ data: row, error: null }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    mocks.createClient.mockResolvedValue({ from: vi.fn().mockReturnValue(query) });
    expect(await renewMenuAction('restaurant')).toMatchObject({ success: allowed });
    expect(mocks.renew).toHaveBeenCalledTimes(allowed ? 1 : 0);
    if (allowed) expect(mocks.renew).toHaveBeenCalledWith('restaurant', actor.id);
  });
});
