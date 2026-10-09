import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAdmin: vi.fn(), resolve: vi.fn(), fetch: vi.fn(), genericFetch: vi.fn(), analyze: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ getAdmin: mocks.getAdmin }));
vi.mock('@/lib/lunch-import/bindings', () => ({ resolveImportSource: mocks.resolve }));
vi.mock('@/services/lunch-import/fetch-html', () => ({ fetchMenuHtml: mocks.fetch }));
vi.mock('@/services/lunch-import/fetch-generic-html', () => ({ fetchGenericHtml: mocks.genericFetch }));
vi.mock('@/services/ai-analyzer', () => ({ analyzeText: mocks.analyze }));
import { previewLunchImport } from './lunch-import';
import { IMPORT_SOURCES, type SourceId } from '@/lib/lunch-import/sources';
import { EXTRACTION_ERROR_MESSAGES } from '@/lib/ai/extraction-errors';
import { extractSofaMenu } from '@/services/lunch-import/sofa';
import { extractSushiMenu } from '@/services/lunch-import/sushi';
const bindingRevision = '1070afce-ff35-4861-b940-f4eb783b9e41';
function resolved(restaurant: { id: string; name: string; address: string }, sourceId: SourceId = 'sofa') {
  return { restaurant, source: { ...IMPORT_SOURCES[sourceId], restaurantId: restaurant.id, bindingRevision } };
}

const restaurant = { id: '1070afce-ff35-4861-b940-f4eb783b9e40', name: 'Sofa Lounge & Restaurant', address: 'al. Paderewskiego 35, Wrocław' };
beforeEach(() => {
  mocks.getAdmin.mockResolvedValue({ id: 'operator' });
  mocks.resolve.mockResolvedValue(resolved(restaurant));
  mocks.fetch.mockResolvedValue('<div id="menu-zestawy-lunch-owe"><div class="m-list__description">12–17</div><li class="m-list__item"><h4 class="m-item__title">Zestaw 1</h4><button class="add-button">40,31 zł</button></li></div>');
  mocks.analyze.mockResolvedValue({ offers: [{ restaurantName: 'AI name', dishes: [{ name: 'Zestaw 1', price: 40.31, dietaryTags: ['vegan'], allergens: ['mleko'], dayOfWeek: 'monday' }] }], sourceType: 'text', confidence: 1, missingFields: [] });
});

describe('import preview authorization and provenance', () => {
  it('routes an active generic source through protected fetching and retains literal review items despite AI differences', async () => {
    const sourceId = `html-${restaurant.id}`;
    mocks.resolve.mockResolvedValue({ restaurant, source: { ...IMPORT_SOURCES.sofa, id: sourceId,
      restaurantId: restaurant.id, bindingRevision, url: 'https://example.org/menu' } });
    mocks.genericFetch.mockResolvedValue({ html: '<section><h2>Lunch</h2><li><strong>Literal set</strong> 31 PLN</li></section>', finalUrl: 'https://example.org/menu' });
    const result = await previewLunchImport({ sourceId });
    expect(result).toMatchObject({ success: true, data: { sourceUrl: 'https://example.org/menu', date: null,
      review: { sourceId, bindingRevision, dishes: [{ name: 'Literal set', price: 31 }] } } });
    expect(mocks.genericFetch).toHaveBeenCalledWith('https://example.org/menu');
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.genericFetch.mockResolvedValueOnce({ html: '<section><h2>Lunch</h2><li><strong>Old set</strong> 31 PLN 2020-01-01</li></section>' });
    expect((await previewLunchImport({ sourceId })).success).toBe(false);
  });
  describe.each(['sofa', 'sushi'] as const)('%s complete analyzer input length', sourceId => {
    it.each([4999, 5000, 5001, 6000])('handles %i characters without truncating the source', async inputLength => {
      const branch = sourceId === 'sofa' ? restaurant : {
        id: '2070afce-ff35-4861-b940-f4eb783b9e40',
        name: 'Sushi Friends Bar & Resto', address: 'ul. Marco Polo 9e, Wrocław',
      };
      mocks.resolve.mockResolvedValue(resolved(branch, sourceId));
      const menuHtml = (description: string) => sourceId === 'sofa'
        ? `<div id="menu-zestawy-lunch-owe"><li class="m-list__item"><h4 class="m-item__title">Zestaw</h4><p class="m-item__description">${description}</p><button class="add-button">31 zł</button></li></div>`
        : `<section id="lunch"><div class="lunches__item"><p class="lunches__title">Zestaw</p><p class="lunches__desc">${description}</p><p class="lunches__price">31 zł</p></div></section>`;
      const adapter = sourceId === 'sofa' ? extractSofaMenu : extractSushiMenu;
      const prefix = `Restauracja: ${branch.name}\nAdres: ${branch.address}\n\n`;
      const baselineLength = prefix.length + adapter(menuHtml('x')).excerpt.length;
      const description = 'x'.repeat(inputLength - baselineLength + 1);
      const expected = adapter(menuHtml(description));
      expect((prefix + expected.excerpt).length).toBe(inputLength);
      mocks.fetch.mockResolvedValue(menuHtml(description));

      const result = await previewLunchImport({ sourceId });
      if (!result.success) throw new Error(result.error);
      expect(result.data.excerpt).toBe(expected.excerpt);
      if (inputLength <= 5000) {
        expect(mocks.analyze).toHaveBeenCalledExactlyOnceWith(prefix + expected.excerpt);
        expect(result.data.extractionMethod).toBe('ai');
      } else {
        expect(mocks.analyze).not.toHaveBeenCalled();
        expect(result.data.extractionMethod).toBe('html');
        expect(result.data.dishes).toEqual(expected.dishes);
        expect(result.data.dishes[0].description).toBe(description);
        expect(result.data.warnings).toContain('Menu zbyt długie do analizy AI. Wyświetlamy pełny odczyt HTML.');
        expect(result.data.warnings).not.toContain(EXTRACTION_ERROR_MESSAGES.unavailable);
      }
    });
  });

  it('binds Sushi to its configured branch and uses its own adapter on AI unavailability', async () => {
    mocks.resolve.mockResolvedValue(resolved({ id: '2070afce-ff35-4861-b940-f4eb783b9e40', name: 'Sushi Friends Bar & Resto', address: 'ul. Marco Polo 9e, Wrocław' }, 'sushi'));
    mocks.fetch.mockResolvedValue('<section id="lunch"><div class="lunches__item"><p class="lunches__title">Lunch I</p><p class="lunches__price">31 zł</p><p class="lunches__desc">Kurczak</p></div></section>');
    mocks.analyze.mockResolvedValue({ offers: [], message: EXTRACTION_ERROR_MESSAGES.unavailable });
    const result = await previewLunchImport({ sourceId: 'sushi' });
    expect(result).toMatchObject({ success: true, data: { sourceUrl: 'https://sushifriendswroclaw.pl/', extractionMethod: 'html', date: null, dishes: [{ name: 'Lunch I', price: 31 }] } });
    expect(mocks.fetch).toHaveBeenCalledWith('sushi');
  });

  it('does not fetch an unbound Sushi source or accept an arbitrary source ID', async () => {
    mocks.resolve.mockResolvedValueOnce(null);
    expect((await previewLunchImport({ sourceId: 'sushi' })).success).toBe(false);
    expect((await previewLunchImport({ sourceId: 'other' })).success).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('checks an explicitly reviewed stored address without weakening the branch guard', async () => {
    mocks.resolve.mockResolvedValue(resolved({ id: '2070afce-ff35-4861-b940-f4eb783b9e40', name: 'Sushi Friends Bar & Resto', address: 'ul. Marco Polo 9e' }, 'sushi'));
    mocks.fetch.mockResolvedValue('<section id="lunch"><div class="lunches__item"><p class="lunches__title">Lunch I</p><p class="lunches__price">31 zł</p></div></section>');
    expect((await previewLunchImport({ sourceId: 'sushi' })).success).toBe(true);
    mocks.fetch.mockClear();
    mocks.resolve.mockResolvedValueOnce(null);
    expect((await previewLunchImport({ sourceId: 'sushi' })).success).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('keeps a source-derived preview available when AI is unavailable', async () => {
    mocks.analyze.mockResolvedValue({ offers: [], message: EXTRACTION_ERROR_MESSAGES.unavailable });
    const result = await previewLunchImport({ sourceId: 'sofa' });
    expect(result).toMatchObject({ success: true, data: {
      extractionMethod: 'html', date: null,
      dishes: [{ name: 'Zestaw 1', price: 40.31 }],
    } });
    if (!result.success) throw new Error(result.error);
    expect(result.data.warnings).toContain(EXTRACTION_ERROR_MESSAGES.unavailable);
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
  });

  it('retains configuration failures without disguising them as empty menus', async () => {
    mocks.analyze.mockResolvedValue({ offers: [], message: EXTRACTION_ERROR_MESSAGES.configuration });
    expect(await previewLunchImport({ sourceId: 'sofa' })).toEqual({ success: false, error: EXTRACTION_ERROR_MESSAGES.configuration });
  });
  it('refuses a non-admin before reading the database or calling external services', async () => {
    mocks.getAdmin.mockResolvedValue(null);
    expect((await previewLunchImport({ sourceId: 'sofa' })).success).toBe(false);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it('rejects arbitrary URLs and disabled sources', async () => {
    expect((await previewLunchImport({ sourceId: 'sofa', url: 'https://evil.test' })).success).toBe(false);
    mocks.resolve.mockResolvedValueOnce(null);
    expect((await previewLunchImport({ sourceId: 'sofa' })).success).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('refuses a missing or changed branch before fetching', async () => {
    mocks.resolve.mockResolvedValueOnce(null);
    expect((await previewLunchImport({ sourceId: 'sofa' })).success).toBe(false);
    mocks.resolve.mockResolvedValueOnce(null);
    expect((await previewLunchImport({ sourceId: 'sofa' })).success).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('uses authoritative branch identity, keeps date unknown and drops inferred labels', async () => {
    const result = await previewLunchImport({ sourceId: 'sofa' });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data.restaurant).toEqual(restaurant);
    expect(result.data.date).toBeNull();
    expect(result.data.dishes).toEqual([{ name: 'Zestaw 1', price: 40.31 }]);
    expect(result.data.excerpt).toContain('40,31 zł');
    expect(result.data.warnings.length).toBeGreaterThan(0);
    expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith('sofa');
  });

  it('distinguishes provider failure from successfully finding no dishes', async () => {
    mocks.analyze.mockResolvedValue({ offers: [], message: 'timeout' });
    expect((await previewLunchImport({ sourceId: 'sofa' })).success).toBe(false);
    mocks.analyze.mockResolvedValue({ offers: [] });
    const result = await previewLunchImport({ sourceId: 'sofa' });
    expect(result.success && result.data.dishes).toEqual([]);
  });

  it('does not call AI when the source fails or has no lunch category', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('HTTP 503'));
    expect(await previewLunchImport({ sourceId: 'sofa' })).toEqual({ success: false, error: 'HTTP 503' });
    mocks.fetch.mockResolvedValue('<h1>General menu</h1>');
    expect((await previewLunchImport({ sourceId: 'sofa' })).success).toBe(false);
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
});
