import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getImportSource, type ImportSource } from '@/lib/lunch-import/sources';
import type { LunchImportPreview } from '@/lib/lunch-import/types';

const receiptSchema = z.object({
  sourceId: z.enum(['sofa', 'sushi']), restaurantId: z.string().uuid(),
  name: z.string(), address: z.string(), fetchedAt: z.string().datetime(),
  itemKeys: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(50),
}).strict();
export const PREVIEW_TTL_MS = 30 * 60 * 1000;

function signingKey() {
  const key = process.env.LUNCH_IMPORT_SIGNING_SECRET;
  return key && key.length >= 32 ? key : null;
}

/** Identity comes from literal source titles, never AI output or reviewed edits. */
export function createImportReview(source: ImportSource, fetchedAt: string, dishes: LunchImportPreview['dishes']) {
  const key = signingKey();
  if (!key || !dishes.length || dishes.length > 50 || dishes.some(dish => !dish.name?.trim())) return null;
  const reviewDishes = dishes.map(dish => ({ ...dish, itemKey: createHash('sha256')
    .update(dish.name!.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pl')).digest('hex') }));
  const itemKeys = reviewDishes.map(dish => dish.itemKey);
  if (new Set(itemKeys).size !== itemKeys.length) return null;
  const body = Buffer.from(JSON.stringify({ sourceId: source.id, restaurantId: source.restaurantId,
    name: source.restaurantName, address: source.branchAddress, fetchedAt, itemKeys })).toString('base64url');
  const signature = createHmac('sha256', key).update(body).digest('base64url');
  return { receipt: `${body}.${signature}`, dishes: reviewDishes };
}

export function verifyImportReceipt(receipt: string) {
  const key = signingKey();
  if (!key) throw new Error('Publikacja importu nie jest skonfigurowana.');
  const [body, signature, extra] = receipt.split('.');
  if (!body || !signature || extra !== undefined) throw new Error('Nieprawidłowy podgląd importu.');
  const expected = createHmac('sha256', key).update(body).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Nieprawidłowy podgląd importu.');
  const parsed = receiptSchema.safeParse(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')));
  if (!parsed.success) throw new Error('Nieprawidłowy podgląd importu.');
  const source = getImportSource(parsed.data.sourceId);
  if (!source || source.restaurantId !== parsed.data.restaurantId || source.restaurantName !== parsed.data.name
    || source.branchAddress !== parsed.data.address) throw new Error('Konfiguracja źródła zmieniła się. Pobierz menu ponownie.');
  const age = Date.now() - Date.parse(parsed.data.fetchedAt);
  if (age > PREVIEW_TTL_MS || age < -60000) throw new Error('Podgląd wygasł. Pobierz menu ponownie.');
  return { ...parsed.data, source };
}
