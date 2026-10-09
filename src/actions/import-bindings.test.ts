import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getAdmin: mocks.admin }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
import { configureImportBinding } from './import-bindings';
const base = { restaurantId: '1070afce-ff35-4861-b940-f4eb783b9e40', sourceId: 'sofa', revision: null,
  expectedName: 'Reviewed restaurant', expectedAddress: 'Reviewed address' };
const confirm = { ...base, action: 'confirm', confirmed: true, evidence: 'Official source and exact branch checked.' };
beforeEach(() => { mocks.admin.mockResolvedValue({ id: 'admin' }); mocks.rpc.mockResolvedValue({ data: { source_id: 'sofa' }, error: null }); });
describe('Admin source setup', () => {
  it('requires Admin and explicit branch confirmation before writing', async () => {
    mocks.admin.mockResolvedValueOnce(null);
    expect((await configureImportBinding(confirm)).success).toBe(false);
    for (const patch of [{ confirmed: false }, { evidence: '' }, { sourceId: 'other' }, { restaurantId: 'missing' }]) {
      expect((await configureImportBinding({ ...confirm, ...patch })).success).toBe(false);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('sends current identity, evidence and revision to independent SQL validation', async () => {
    expect((await configureImportBinding(confirm)).success).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('configure_lunch_import_binding', expect.objectContaining({
      p_restaurant_id: base.restaurantId, p_expected_name: base.expectedName, p_expected_address: base.expectedAddress,
      p_confirmed: true, p_evidence: confirm.evidence, p_revision: null,
    }));
    expect(mocks.revalidate).toHaveBeenCalledWith(`/restaurants/${base.restaurantId}`);
  });
  it('disables without publication approval and reports a database conflict without a success message', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'configuration changed' } });
    expect((await configureImportBinding({ ...base, action: 'disable' })).success).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledWith('configure_lunch_import_binding', expect.objectContaining({ p_action: 'disable', p_confirmed: false }));
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
