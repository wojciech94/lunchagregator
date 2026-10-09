import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), analyze: vi.fn(), cache: new Map<string, unknown>() }));
vi.mock('./fetch-generic-html', async original => ({ ...await original<typeof import('./fetch-generic-html')>(), fetchPublicResource: mocks.fetch }));
vi.mock('@/services/ai-analyzer', () => ({ analyzeImage: mocks.analyze }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => Promise<unknown>, keys: string[]) => async () => {
  const key = keys.join(':'); if (!mocks.cache.has(key)) mocks.cache.set(key, await fn()); return mocks.cache.get(key);
} }));
import { readMeatologiaMenu, requireMeatologiaBranch, resolveMeatologiaLunch, validateMeatologiaUrl, validateMenuImage } from './meatologia';
import { MEATOLOGIA_URL, MEATOLOGIA_ADDRESS } from '@/lib/lunch-import/meatologia';
const asset = 'https://cdn.shopify.com/s/files/1/0930/9054/5989/files/lunch.jpg?v=1';
const card = (url = asset, title = 'WROCŁAW, WŁODKOWICA', address = MEATOLOGIA_ADDRESS) => `<div class="mto-card" data-index="99"><div class="mto-title">${title}</div><div class="mto-address">${address}</div><div class="mto-actions"><a href="main.pdf">Menu główne</a><a href="\n${url}\n">Menu lunch</a></div></div>`;
const branch = { name: 'Meatologia Włodkowica', address: MEATOLOGIA_ADDRESS };
let bytes: Buffer;
beforeEach(async () => {
  mocks.cache.clear(); mocks.fetch.mockReset(); mocks.analyze.mockReset();
  bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#ff0000' } }).jpeg().toBuffer();
  mocks.fetch.mockImplementation(async (url: string) => url === MEATOLOGIA_URL
    ? { bytes: Buffer.from(card()), finalUrl: url, contentType: 'text/html' }
    : { bytes, finalUrl: url, contentType: 'image/jpeg' });
  mocks.analyze.mockResolvedValue({ offers: [{ dishes: [{ name: 'Stek', price: 59, description: 'Frytki' }] }], availability: 'w dni robocze do 16:00' });
});
describe('Meatologia image menu pilot', () => {
  it('finds the branch by identity, ignores order and main PDF, resolves updated URLs', () => {
    const other = card(asset, 'WROCŁAW, ZWYCIĘSKA', 'Zwycięska 45');
    expect(resolveMeatologiaLunch(other + card())).toMatchObject({ assetUrl: asset });
    expect(resolveMeatologiaLunch(card(asset.replace('v=1', 'v=2'))).assetUrl).toContain('v=2');
    expect(() => resolveMeatologiaLunch(card() + card())).toThrow('jednoznacznego lokalu');
    expect(() => resolveMeatologiaLunch(other)).toThrow();
    expect(() => resolveMeatologiaLunch(card().replace('Menu lunch', 'Inne'))).toThrow('linku');
    expect(() => resolveMeatologiaLunch(card().replace('</div></div>', `<a href="${asset}">Menu lunch</a></div></div>`))).toThrow('linku');
  });
  it.each(['http://cdn.shopify.com/x.jpg', 'https://evil.example/lunch.jpg', asset.replace('5989', '5990'), asset.replace('.jpg', '.pdf'), asset.replace('lunch.jpg', '%2e%2e%2fx.jpg'), asset + '#fragment'])('rejects unsafe or unsupported asset %s', url => {
    expect(() => validateMeatologiaUrl(new URL(url))).toThrow();
  });
  it('refuses a different restaurant/branch before any fetch or AI', async () => {
    expect(() => requireMeatologiaBranch({ ...branch, address: 'Zwycięska 45' })).toThrow();
    await expect(readMeatologiaMenu({ ...branch, name: 'Other brand' })).rejects.toThrow();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('decodes bounded real JPEG/PNG and rejects mislabeled, broken, oversized and animated images', async () => {
    await expect(validateMenuImage(bytes, 'image/jpeg')).resolves.toBeUndefined();
    const png = await sharp(bytes).png().toBuffer();
    await expect(validateMenuImage(png, 'image/png')).resolves.toBeUndefined();
    await expect(validateMenuImage(bytes, 'image/png')).rejects.toThrow();
    await expect(validateMenuImage(Buffer.from('<html>'), 'image/jpeg')).rejects.toThrow();
    await expect(validateMenuImage(bytes.subarray(0, 100), 'image/jpeg')).rejects.toThrow();
    await expect(validateMenuImage(Buffer.alloc(2 * 1024 * 1024 + 1), 'image/jpeg')).rejects.toThrow('2 MB');
    const huge = await sharp({ create: { width: 6001, height: 1, channels: 3, background: 'red' } }).png().toBuffer();
    await expect(validateMenuImage(huge, 'image/png')).rejects.toThrow('6000');
  });
  it('refetches bytes and caches only validated extraction by hash even after URL changes', async () => {
    const first = await readMeatologiaMenu(branch);
    const second = await readMeatologiaMenu(branch);
    expect(first).toMatchObject({ conditions: 'w dni robocze do 16:00', dishes: [{ name: 'Stek', price: 59 }] });
    expect(first.imageDataUrl).toContain(bytes.toString('base64'));
    expect(second.menuImage.contentHash).toBe(first.menuImage.contentHash);
    expect(mocks.fetch).toHaveBeenCalledTimes(4); expect(mocks.analyze).toHaveBeenCalledTimes(1);
    mocks.fetch.mockImplementation(async (url: string) => url === MEATOLOGIA_URL
      ? { bytes: Buffer.from(card(asset.replace('v=1', 'v=2'))), finalUrl: url, contentType: 'text/html' }
      : { bytes, finalUrl: url, contentType: 'image/jpeg' });
    expect((await readMeatologiaMenu(branch)).menuImage.assetUrl).toContain('v=2');
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
    bytes = await sharp(bytes).modulate({ brightness: 0.5 }).jpeg().toBuffer();
    await readMeatologiaMenu(branch); expect(mocks.analyze).toHaveBeenCalledTimes(2);
  });
  it.each([{ offers: [] }, { message: 'provider unavailable' }, { offers: [{ dishes: [{ name: null, price: 10 }] }] },
    { offers: [{ dishes: [{ name: 'Stek', price: 59 }, { name: 'STEK', price: 59 }] }] }])('does not cache provider failures/empty/ambiguous extraction (%#)', async bad => {
    mocks.analyze.mockResolvedValueOnce(bad);
    await expect(readMeatologiaMenu(branch)).rejects.toThrow();
    await expect(readMeatologiaMenu(branch)).resolves.toBeDefined();
    expect(mocks.analyze).toHaveBeenCalledTimes(2);
  });
});
