import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), analyze: vi.fn(), cache: new Map<string, unknown>() }));
vi.mock('./fetch-generic-html', async original => ({ ...await original<typeof import('./fetch-generic-html')>(), fetchPublicResource: mocks.fetch }));
vi.mock('@/services/ai-analyzer', () => ({ analyzePdf: mocks.analyze }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => Promise<unknown>, keys: string[]) => async () => {
  const key = keys.join(':'); if (!mocks.cache.has(key)) mocks.cache.set(key, await fn()); return mocks.cache.get(key);
} }));
import { readSushiCornerMenu, requireSushiCornerBranch, resolveSushiCornerLunch, validateSushiCornerUrl } from './sushi-corner';
import { validateMenuPdf } from './validate-pdf';
import { SUSHI_CORNER_URL, SUSHI_CORNER_ADDRESS } from '@/lib/lunch-import/sushi-corner';
import { EXTRACTION_ERROR_MESSAGES } from '@/lib/ai/extraction-errors';
const fixture = readFileSync('tests/fixtures/lunch-import/sushi-corner.pdf');
const asset = 'https://sushicorner.pl/wp-content/uploads/sites/7/2025/04/sushi-corner-lunch-menu-english.pdf';
const page = (url = asset) => `<a href="main.pdf">Main menu</a><a href="${url}"><span>Lunch Menu Download</span></a>`;
const branch = { name: 'Sushi Corner', address: SUSHI_CORNER_ADDRESS };
let bytes: Buffer;
beforeEach(() => {
  bytes = fixture; mocks.cache.clear(); mocks.fetch.mockReset(); mocks.analyze.mockReset();
  mocks.fetch.mockImplementation(async (url: string) => ({ bytes: url === SUSHI_CORNER_URL ? Buffer.from(page()) : bytes, finalUrl: url }));
  mocks.analyze.mockResolvedValue({ offers: [{ dishes: [{ name: 'Lunch set I', price: 40, description: 'Variants; paid extra 5 PLN' }] }], availability: 'Monday–Friday 12–16' });
});
describe('Sushi Corner linked PDF pilot', () => {
  it.each(['ul. Włodkowica 12a, Wrocław', SUSHI_CORNER_ADDRESS])('accepts the exact branch: %s', address => {
    expect(() => requireSushiCornerBranch({ ...branch, address })).not.toThrow();
  });
  it('blocks other brands and addresses before fetching', async () => {
    for (const patch of [{ name: 'Sushi Friends' }, { address: 'Włodkowica 12, Wrocław' }, { address: 'Włodkowica 12a, Kraków' }]) {
      await expect(readSushiCornerMenu({ ...branch, ...patch })).rejects.toThrow();
    }
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.analyze).not.toHaveBeenCalled();
  });
  it('discovers only one labelled official lunch PDF and accepts a changed upload path', () => {
    expect(resolveSushiCornerLunch(readFileSync('tests/fixtures/lunch-import/sushi-corner-discovery.html', 'utf8'))).toBe(asset);
    expect(resolveSushiCornerLunch(page())).toBe(asset);
    expect(resolveSushiCornerLunch(page(asset.replace('/2025/04/', '/2026/10/')))).toContain('/2026/10/');
    expect(() => resolveSushiCornerLunch(page() + page())).toThrow('jednoznacznego');
    expect(() => resolveSushiCornerLunch('<a href="main.pdf">Main menu</a>')).toThrow();
  });
  it.each(['https://evil.example/lunch.pdf', asset + '#fragment', asset + '?x=1', asset.replace('/sites/7/', '/sites/8/'),
    asset.replace('lunch-menu', 'main-menu'), asset.replace('https:', 'http:'), 'https://127.0.0.1/lunch.pdf'])('rejects forbidden URL %s', url => {
    expect(() => validateSushiCornerUrl(new URL(url))).toThrow();
  });
  it('parses the captured one-page PDF and rejects malformed, oversized, multiple-page and oversized-page files', async () => {
    await expect(validateMenuPdf(fixture)).resolves.toBeUndefined();
    for (const bad of [Buffer.from('<html>'), fixture.subarray(0, 100), Buffer.alloc(2 * 1024 * 1024 + 1)]) {
      await expect(validateMenuPdf(bad)).rejects.toThrow();
    }
    for (const sizes of [[[600, 800], [600, 800]], [[2001, 100]]]) {
      const doc = await PDFDocument.create(); for (const size of sizes) doc.addPage([size[0], size[1]]);
      await expect(validateMenuPdf(Buffer.from(await doc.save()))).rejects.toThrow('jednostronicowy');
    }
    const encrypted = await PDFDocument.create(); encrypted.addPage();
    encrypted.context.trailerInfo.Encrypt = encrypted.context.register(encrypted.context.obj({ Filter: 'Standard' }));
    await expect(validateMenuPdf(Buffer.from(await encrypted.save()))).rejects.toThrow('niezaszyfrowany');
  });
  it('refetches discovery and bytes each time, caching successful extraction only by content hash', async () => {
    const first = await readSushiCornerMenu(branch);
    const second = await readSushiCornerMenu(branch);
    expect(first.pdfDataUrl).toContain(fixture.toString('base64'));
    expect(first.menuPdf.contentHash).toBe('97aa2e5308766584bc51324628791eeb76fe62980ce4d78688025cda38f68fb3');
    expect(second.menuPdf.contentHash).toBe(first.menuPdf.contentHash);
    expect(mocks.fetch).toHaveBeenCalledTimes(4); expect(mocks.analyze).toHaveBeenCalledTimes(1);
    mocks.fetch.mockImplementation(async (url: string) => ({ bytes: url === SUSHI_CORNER_URL ? Buffer.from(page(asset.replace('/2025/04/', '/2026/10/'))) : bytes, finalUrl: url }));
    expect((await readSushiCornerMenu(branch)).menuPdf.assetUrl).toContain('/2026/10/');
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
    const changed = await PDFDocument.load(bytes); changed.setTitle('Updated menu'); bytes = Buffer.from(await changed.save());
    await readSushiCornerMenu(branch); expect(mocks.analyze).toHaveBeenCalledTimes(2);
  });
  it.each([{ offers: [] }, { offers: [{ dishes: [{ name: '', price: 40 }] }] },
    { offers: [{ dishes: [{ name: 'Set I', price: 40 }, { name: 'SET I', price: 50 }] }] },
    { offers: [], message: EXTRACTION_ERROR_MESSAGES.unavailable }])('does not cache invalid or failed extraction (%#)', async invalid => {
    mocks.analyze.mockResolvedValueOnce(invalid);
    await expect(readSushiCornerMenu(branch)).rejects.toThrow();
    await expect(readSushiCornerMenu(branch)).resolves.toBeDefined();
    expect(mocks.analyze).toHaveBeenCalledTimes(2);
  });
  it('keeps ambiguous prices null and does not expose provider details', async () => {
    mocks.analyze.mockResolvedValueOnce({ offers: [{ dishes: [{ name: 'Set I', price: null }] }] });
    expect((await readSushiCornerMenu(branch)).dishes[0].price).toBeNull();
    mocks.cache.clear(); mocks.analyze.mockResolvedValueOnce({ message: 'private provider body' });
    await expect(readSushiCornerMenu(branch)).rejects.toThrow('Nie udało się odczytać PDF menu. Spróbuj ponownie.');
  });
});
