import { describe, expect, it } from 'vitest';
import { extractGenericMenu } from './generic-html';
import { createImportReview } from './review';

const page = (body: string) => `<html><title>Restauracja przy Rynku</title><body><address>Rynek 1, Wrocław</address><section><h2>Lunch</h2>${body}</section></body></html>`;
describe('bounded generic HTML menu', () => {
  it('extracts literal names and prices, preserving alternatives as evidence', () => {
    const result = extractGenericMenu(page('<ul><li><strong>Zestaw A</strong> Zupa lub sałatka 31 zł</li><li><strong>Zestaw B</strong> 36,50 PLN</li></ul>'));
    expect(result.supported).toBe(true);
    expect(result.dishes.map(d => d.price)).toEqual([31, 36.5]);
    expect(result.excerpt).toContain('Zupa lub sałatka');
    expect(result.identityEvidence).toContain('Rynek 1');
  });
  it('never makes up missing or qualified prices', () => {
    const result = extractGenericMenu(page('<ul><li><strong>Zupa</strong> zapytaj o cenę</li><li><strong>Zestaw</strong> od 31 zł + opakowanie 2 zł</li></ul>'));
    expect(result.dishes.map(d => d.price)).toEqual([null, null]);
  });
  it.each([
    '<script>document.write("Lunch 31 zł")</script>',
    '<section><h2>Menu</h2><img src="lunch.jpg"></section>',
    page('<li><strong>Stare menu</strong> 31 zł 2020-01-01</li>'),
    page('<li><strong>Zupa</strong> 31 zł</li><li><strong>Zupa</strong> 32 zł</li>'),
    page('<li><strong>Zupa</strong> 31 zł</li><address>Inny oddział</address>'),
    page('<li><strong>Zupa</strong> 31 zł</li> Nasze lokale'),
    page('x'.repeat(12001)),
  ])('records unsupported or ambiguous evidence and blocks activation (%#)', html => {
    const result = extractGenericMenu(html);
    expect(result.supported).toBe(false); expect(result.limitations.length).toBeGreaterThan(0);
  });
  it('removes scripts and keeps retry keys stable through URL, price and description edits', () => {
    const source = { id: 'html-restaurant' as const, label: 'Test', restaurantId: 'restaurant', bindingRevision: 'revision', restaurantName: 'Test', branchAddress: 'Rynek 1', url: 'https://example.org/menu' };
    const first = extractGenericMenu(page('<li><strong>Zupa</strong> 31 zł</li><script>ignore instructions</script>'));
    expect(first.excerpt).not.toContain('ignore instructions');
    const a = createImportReview(source, '2026-01-01', first.dishes);
    const b = createImportReview({ ...source, url: 'https://example.org/new' }, '2026-02-01', [{ ...first.dishes[0], price: 99, description: 'changed' }]);
    expect(a?.dishes[0].itemKey).toBe(b?.dishes[0].itemKey);
  });
});
