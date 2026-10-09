import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn(), from: vi.fn(), single: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getAdmin: mocks.admin }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock('@/services/lunch-import/fetch-generic-html', async importOriginal => {
  const original = await importOriginal<typeof import('@/services/lunch-import/fetch-generic-html')>();
  return { ...original, fetchGenericHtml: mocks.fetch };
});
import { configureGenericSource } from './generic-source';
const restaurantId = '1070afce-ff35-4861-b940-f4eb783b9e40';
const revision = '1170afce-ff35-4861-b940-f4eb783b9e40';
const base = { restaurantId, revision, expectedName: 'Restaurant', expectedAddress: 'Branch' };
beforeEach(() => {
  mocks.admin.mockResolvedValue({ id: 'admin' });
  mocks.rpc.mockResolvedValue({ data: { source_id: `html-${restaurantId}` }, error: null });
  mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ single: mocks.single }) }) });
  mocks.single.mockResolvedValue({ data: { restaurant_id: restaurantId, revision, source_url: 'https://example.org/menu' }, error: null });
  mocks.fetch.mockResolvedValue({ html: '<section><h2>Lunch</h2><ul><li><strong>Zupa</strong> 31 PLN</li></ul></section>', finalUrl: 'https://example.org/menu' });
});
describe('generic source Admin actions', () => {
  it('requires Admin before reads, fetching or writes', async () => {
    mocks.admin.mockResolvedValue(null);
    expect((await configureGenericSource({ ...base, action: 'trial' })).success).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects unsafe drafts and missing human activation confirmation', async () => {
    for (const patch of [{ action: 'draft', url: 'http://example.org' }, { action: 'draft', url: 'https://127.0.0.1' },
      { action: 'confirm', confirmed: false, evidence: 'Checked source' }, { action: 'confirm', confirmed: true }]) {
      expect((await configureGenericSource({ ...base, ...patch })).success).toBe(false);
    }
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('records actual fetched evidence and literal items without publication or AI authority', async () => {
    expect((await configureGenericSource({ ...base, action: 'trial' })).success).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('configure_generic_import_source', expect.objectContaining({
      p_action: 'trial', p_revision: revision, p_confirmed: false,
      p_trial: expect.objectContaining({ supported: true, finalUrl: 'https://example.org/menu',
        dishes: [expect.objectContaining({ name: 'Zupa', price: 31 })] }),
    }));
  });
  it('records unavailable source failures explicitly as unsupported trials', async () => {
    mocks.fetch.mockRejectedValue(new Error('HTTP 503'));
    expect((await configureGenericSource({ ...base, action: 'trial' })).success).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('configure_generic_import_source', expect.objectContaining({
      p_trial: expect.objectContaining({ supported: false, limitations: ['HTTP 503'], dishes: [] }),
    }));
  });
  it('never fetches a stale binding and reports SQL races instead of success', async () => {
    mocks.single.mockResolvedValueOnce({ data: { revision: 'changed' }, error: null });
    expect((await configureGenericSource({ ...base, action: 'trial' })).success).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'changed' } });
    expect((await configureGenericSource({ ...base, action: 'trial' })).success).toBe(false);
  });
});
