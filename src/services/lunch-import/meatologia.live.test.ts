import { expect, it, vi } from 'vitest';
import { MEATOLOGIA_ADDRESS } from '@/lib/lunch-import/meatologia';
// Real public transport/image decode; provider deliberately mocked, no live AI spend.
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => Promise<unknown>) => fn }));
vi.mock('@/services/ai-analyzer', () => ({ analyzeImage: vi.fn(async () => ({ offers: [{ dishes: [{ name: 'Fixture dish', price: 1 }] }] })) }));
import { readMeatologiaMenu } from './meatologia';
it.skipIf(process.env.MEATOLOGIA_LIVE_TEST !== 'true')('fetches the official branch and decodes its current lunch image without login', async () => {
  const menu = await readMeatologiaMenu({ name: 'Meatologia', address: MEATOLOGIA_ADDRESS });
  expect(menu.menuImage.assetUrl).toContain('cdn.shopify.com/s/files/1/0930/9054/5989/files/');
  expect(menu.menuImage.contentHash).toMatch(/^[a-f0-9]{64}$/);
  console.info('Real source fetch (mocked extraction):', menu.fetchedAt, menu.menuImage);
}, 30000);
