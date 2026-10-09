import { afterEach, describe, expect, it, vi } from 'vitest';
import { createImportReview } from './review';
import { IMPORT_SOURCES } from '@/lib/lunch-import/sources';

afterEach(() => vi.unstubAllEnvs());

describe('import review identity', () => {
  it('works without a signing secret and retains source identity across normalization and price changes', () => {
    vi.stubEnv('LUNCH_IMPORT_SIGNING_SECRET', '');
    const source = { ...IMPORT_SOURCES.sofa, restaurantId: '1070afce-ff35-4861-b940-f4eb783b9e40', bindingRevision: '1070afce-ff35-4861-b940-f4eb783b9e41' };
    const fetchedAt = new Date().toISOString();
    const first = createImportReview(source, fetchedAt, [{ name: ' ZESTAW   1 ', price: 31 }])!;
    const second = createImportReview(source, fetchedAt, [{ name: 'Zestaw 1', price: 32 }])!;
    expect(second.dishes[0].itemKey).toBe(first.dishes[0].itemKey);
    expect(first).toMatchObject({ sourceId: 'sofa', restaurantId: source.restaurantId, fetchedAt });
    expect(first).not.toHaveProperty('receipt');
  });
  it('disables publication for missing or ambiguous source titles', () => {
    const source = { ...IMPORT_SOURCES.sofa, restaurantId: '1070afce-ff35-4861-b940-f4eb783b9e40', bindingRevision: '1070afce-ff35-4861-b940-f4eb783b9e41' };
    const fetchedAt = new Date().toISOString();
    expect(createImportReview(source, fetchedAt, [{ name: null, price: 31 }])).toBeNull();
    expect(createImportReview(source, fetchedAt, [{ name: 'Set', price: 31 }, { name: ' SET ', price: 32 }])).toBeNull();
  });
});
