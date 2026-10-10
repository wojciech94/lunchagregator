import { expect, it, vi } from 'vitest';
import { SUSHI_CORNER_ADDRESS } from '@/lib/lunch-import/sushi-corner';
// Opt-in real protected transport and parser; no paid provider call or publication.
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => Promise<unknown>) => fn }));
vi.mock('@/services/ai-analyzer', () => ({ analyzePdf: vi.fn(async () => ({ offers: [{ dishes: [{ name: 'Fixture dish', price: 1 }] }] })) }));
import { readSushiCornerMenu } from './sushi-corner';
it.skipIf(process.env.SUSHI_CORNER_LIVE_TEST !== 'true')('discovers and validates the current official lunch PDF', async () => {
  const menu = await readSushiCornerMenu({ name: 'Sushi Corner', address: SUSHI_CORNER_ADDRESS });
  expect(menu.menuPdf.assetUrl).toContain('sushicorner.pl/wp-content/uploads/sites/7/');
  expect(menu.menuPdf.contentHash).toMatch(/^[a-f0-9]{64}$/);
  console.info('Real source fetch (mocked extraction):', menu.fetchedAt, menu.menuPdf);
}, 30000);
