import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createImportReview, verifyImportReceipt, PREVIEW_TTL_MS } from './receipt';
import { getImportSource } from '@/lib/lunch-import/sources';

beforeEach(() => {
  vi.stubEnv('LUNCH_IMPORT_SIGNING_SECRET', 'test-only-012345678901234567890123456789');
  vi.stubEnv('SOFA_IMPORT_RESTAURANT_ID', '1070afce-ff35-4861-b940-f4eb783b9e40');
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
function review(name = 'Zestaw 1') {
  const source = getImportSource('sofa');
  if (!source) throw new Error('Missing test source');
  const result = createImportReview(source, new Date().toISOString(), [{ name, price: 31 }]);
  if (!result) throw new Error('Missing test review');
  return result;
}

describe('import preview receipt', () => {
  it('retains source identity across normalization and does not depend on price', () => {
    const first = review(' ZESTAW   1 ');
    expect(review().dishes[0].itemKey).toBe(first.dishes[0].itemKey);
    expect(verifyImportReceipt(first.receipt).itemKeys).toEqual([first.dishes[0].itemKey]);
  });
  it('rejects tampering, expired previews, future previews and changed branch bindings', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
    const initial = review();
    expect(() => verifyImportReceipt(`x${initial.receipt}`)).toThrow('Nieprawidłowy');
    vi.setSystemTime(new Date(Date.now() + PREVIEW_TTL_MS + 1));
    expect(() => verifyImportReceipt(initial.receipt)).toThrow('wygasł');
    vi.setSystemTime(new Date('2026-10-08T11:00:00Z'));
    expect(() => verifyImportReceipt(initial.receipt)).toThrow('wygasł');
    vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
    vi.stubEnv('SOFA_IMPORT_RESTAURANT_ID', '2070afce-ff35-4861-b940-f4eb783b9e40');
    expect(() => verifyImportReceipt(initial.receipt)).toThrow('Konfiguracja');
  });
  it('keeps preview-only mode without a secret or with ambiguous source identities', () => {
    const source = getImportSource('sofa')!;
    expect(createImportReview(source, new Date().toISOString(), [{ name: null, price: 31 }])).toBeNull();
    expect(createImportReview(source, new Date().toISOString(), [{ name: 'Set', price: 31 }, { name: ' SET ', price: 32 }])).toBeNull();
    vi.stubEnv('LUNCH_IMPORT_SIGNING_SECRET', '');
    expect(createImportReview(source, new Date().toISOString(), [{ name: 'Set', price: 31 }])).toBeNull();
    expect(() => verifyImportReceipt('anything')).toThrow('skonfigurowana');
  });
});
