import { describe, expect, it } from 'vitest';
import { bindingIsActive, type ImportBinding } from './binding-state';
import { normalizeImportIdentity } from './identity';
import { IMPORT_SOURCES } from './sources';

const definition = IMPORT_SOURCES.sushi;
const restaurant = { name: definition.restaurantName, address: definition.branchAddress };
const binding: ImportBinding = {
  source_id: 'sushi', restaurant_id: '1070afce-ff35-4861-b940-f4eb783b9e40', enabled: true,
  revision: '1070afce-ff35-4861-b940-f4eb783b9e41', verified_name: restaurant.name,
  verified_address: restaurant.address, source_url: definition.url, source_name: definition.restaurantName,
  source_address: definition.branchAddress, verification_note: 'Official branch confirmed by Admin',
  verified_at: '2026-10-09T08:00:00Z', verified_by: 'admin-id',
};
describe('verified source identity', () => {
  it('retains formatting-equivalent addresses but does not normalize away typos or branch numbers', () => {
    expect(bindingIsActive(binding, { ...restaurant, address: 'ULICA Marco Polo 9e Wrocław' })).toBe(true);
    for (const address of ['ul. Marco Polo 99, Wrocław', 'ul. Marco Pollo 9e, Wrocław', 'ul. Marco Polo 9e']) {
      expect(bindingIsActive(binding, { ...restaurant, address })).toBe(false);
    }
    expect(normalizeImportIdentity('  Al. Paderewskiego 35, Wrocław ')).toBe(normalizeImportIdentity('aleja Paderewskiego 35 Wrocław'));
  });
  it('refuses disabled, unverified and changed-source snapshots', () => {
    for (const patch of [{ enabled: false }, { verified_by: null }, { verified_at: null },
      { source_url: 'https://other.test/' }, { source_name: 'Different branch' }, { source_address: 'Other address' }]) {
      expect(bindingIsActive({ ...binding, ...patch }, restaurant)).toBe(false);
    }
  });
  it('uses the reviewed Restaurant snapshot, allowing an explicitly explained typo at initial confirmation', () => {
    const reviewed = { ...restaurant, address: 'ul. Marco Pollo 9e, Wrocław' };
    expect(bindingIsActive({ ...binding, verified_address: reviewed.address }, reviewed)).toBe(true);
    expect(bindingIsActive(binding, reviewed)).toBe(false);
  });
});
