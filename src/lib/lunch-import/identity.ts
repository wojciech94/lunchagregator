/** Conservative comparison: casing, punctuation and common street prefixes.
 * Typos and changed words/numbers still require review. Keep in sync with SQL
 * normalize_import_identity in migration 20261009000000.
 */
export function normalizeImportIdentity(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('pl').trim()
    .replace(/^(ulica|ul|aleja|al)\.?\s+/, '')
    .replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function sameImportIdentity(a: { name: string; address: string }, b: { name: string; address: string }) {
  return normalizeImportIdentity(a.name) === normalizeImportIdentity(b.name)
    && normalizeImportIdentity(a.address) === normalizeImportIdentity(b.address);
}
