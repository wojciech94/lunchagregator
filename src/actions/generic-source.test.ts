import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn(), from: vi.fn(), single: vi.fn(), fetch: vi.fn(), image: vi.fn(), branch: vi.fn(), pdf: vi.fn() }));
vi.mock('@/services/lunch-import/sushi-corner', async original => ({ ...await original<typeof import('@/services/lunch-import/sushi-corner')>(), readSushiCornerMenu: mocks.pdf }));
vi.mock('@/services/lunch-import/meatologia', () => ({ readMeatologiaMenu: mocks.image, requireMeatologiaBranch: mocks.branch }));
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
  it('stores PDF metadata without bytes and returns exact bytes only for the new trial', async () => {
    const source_url = 'https://sushicorner.pl/wlodkowica/menu-en/lunch/';
    mocks.single.mockResolvedValue({ data: { restaurant_id: restaurantId, revision, source_url }, error: null });
    const menuPdf = { assetUrl: 'https://sushicorner.pl/menu.pdf', contentHash: 'a'.repeat(64) };
    mocks.pdf.mockResolvedValue({ supported: true, limitations: [], dishes: [{ name: 'Lunch set I', price: 40 }],
      identityEvidence: 'Włodkowica 12a', excerpt: 'AI transcript', fetchedAt: new Date().toISOString(), finalUrl: source_url,
      menuPdf, conditions: '12–16', pdfDataUrl: 'data:application/pdf;base64,fixture' });
    mocks.rpc.mockImplementation(async (_name, payload) => ({ data: { trial: structuredClone(payload.p_trial) } }));
    expect(await configureGenericSource({ ...base, action: 'trial' })).toMatchObject({ success: true,
      data: { trial: { menuPdf: { ...menuPdf, dataUrl: 'data:application/pdf;base64,fixture' } } } });
    expect(JSON.stringify(mocks.rpc.mock.calls[0][1])).not.toContain('base64');
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.pdf.mockRejectedValueOnce(new Error('PDF unavailable'));
    await configureGenericSource({ ...base, action: 'trial' });
    expect(mocks.rpc.mock.calls[1][1].p_trial).toMatchObject({ supported: false, dishes: [], limitations: ['PDF unavailable'] });
  });
  it('rejects Sushi Corner drafts for a different branch before any write', async () => {
    expect((await configureGenericSource({ ...base, action: 'draft', url: 'https://sushicorner.pl/wlodkowica/menu-en/lunch/' })).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('routes Meatologia trial through image analysis, stores evidence without image bytes and records failed analysis as unsupported', async () => {
    const source_url = 'https://meatologia.pl/pages/nasze-lokale';
    mocks.single.mockResolvedValue({ data: { restaurant_id: restaurantId, revision, source_url }, error: null });
    const menuImage = { assetUrl: 'https://cdn.shopify.com/lunch.jpg', contentHash: 'a'.repeat(64) };
    mocks.image.mockResolvedValue({ supported: true, limitations: [], dishes: [{ name: 'Stek', price: 59 }],
      identityEvidence: 'Włodkowica 27', excerpt: 'Stek 59 PLN', fetchedAt: new Date().toISOString(), finalUrl: source_url,
      menuImage, conditions: 'do 16:00', imageDataUrl: 'data:image/jpeg;base64,privatebytes' });
    expect((await configureGenericSource({ ...base, action: 'trial' })).success).toBe(true);
    const payload = mocks.rpc.mock.calls[0][1].p_trial;
    expect(payload).toMatchObject({ supported: true, menuImage, conditions: 'do 16:00' });
    expect(payload.imageDataUrl).toBeUndefined(); expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.image.mockRejectedValueOnce(new Error('Image analysis failed'));
    await configureGenericSource({ ...base, action: 'trial' });
    expect(mocks.rpc.mock.calls[1][1].p_trial).toMatchObject({ supported: false, dishes: [], limitations: ['Image analysis failed'] });
  });
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
