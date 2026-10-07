// Regression tests for `createOffersBatchAction` error reporting.
//
// Publishing a weekly menu used to surface a bare "Validation failed". One bad
// shared field -- a missing restaurant name, the common case for a menu photo
// -- fails every day of the menu at once, and the batch action reduced all of
// those failures to the first one's `error` string, discarding the fieldErrors
// that say which field was wrong.

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { getUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createOffersBatchAction } from './offers';

const USER_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.mocked(getUser).mockResolvedValue({ id: USER_ID } as never);

  // A chainable PostgREST stand-in: insert().select().single()
  const from = vi.fn(() => {
    const builder: Record<string, unknown> = {};
    builder.insert = () => builder;
    builder.select = () => builder;
    builder.single = async () => ({
      data: {
        id: 'offer-1',
        currency: 'PLN',
        restaurant_location: null,
        session_token: null,
        created_at: '',
        updated_at: '',
        items: [],
        dietary_tags: [],
        allergens: [],
        description: null,
        cuisine_type: null,
      },
      error: null,
    });
    return builder;
  });
  vi.mocked(createClient).mockResolvedValue({ from } as never);
});

function isoPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function payloads(restaurantName: string) {
  return ['a', 'b', 'c'].map((_, i) => ({
    dishName: `Danie ${i}`,
    price: 24.9,
    restaurantName,
    availableDate: isoPlus(i + 1),
    sourceType: 'photo' as const,
    description: undefined,
    items: [],
    dietaryTags: [],
    allergens: [],
  }));
}

describe('createOffersBatchAction', () => {
  it('reports which field was wrong, not just "Validation failed"', async () => {
    // This is the reported failure: an empty restaurant name fails
    // `z.string().min(1)` on every payload, and the User used to be told only
    // that validation failed.
    const result = await createOffersBatchAction(payloads(''));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).not.toBe('Validation failed');
    expect(result.error).toMatch(/restaurant name/i);
    expect(result.fieldErrors).toMatchObject({ restaurantName: expect.any(String) });
  });

  it('falls back to the raw error when the failure carries no field detail', async () => {
    // A failure from the database rather than from Zod -- an RLS rejection or
    // a constraint violation -- has no fieldErrors, so the wording has to come
    // from `failed[0].error` instead.
    vi.mocked(createClient).mockResolvedValue({
      from: () => {
        const builder: Record<string, unknown> = {};
        builder.insert = () => builder;
        builder.select = () => builder;
        builder.single = async () => ({
          data: null,
          error: { message: 'new row violates row-level security policy' },
        });
        return builder;
      },
    } as never);

    const result = await createOffersBatchAction(payloads('Bar Mleko'));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors).toBeUndefined();
    expect(result.error).toMatch(/row-level security/);
  });

  it('still succeeds for a well-formed weekly batch', async () => {
    const result = await createOffersBatchAction(payloads('Bar Mleko'));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.created).toHaveLength(3);
    expect(result.data.failed).toHaveLength(0);
  });

  it('reports the field error alongside a partial success', async () => {
    // Two good days, one with a price the schema rejects. The User should learn
    // which day failed, not just that one did.
    const items = payloads('Bar Mleko');
    items[1] = { ...items[1], price: 0 };

    const result = await createOffersBatchAction(items);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.created).toHaveLength(2);
    expect(result.data.failed).toHaveLength(1);
    expect(result.data.failed[0].index).toBe(1);
    expect(result.data.failed[0].fieldErrors).toMatchObject({ price: expect.any(String) });
  });
});
it('rejects an oversized batch before calling auth or the database', async () => {
  vi.mocked(getUser).mockClear();
  vi.mocked(createClient).mockClear();
  const result = await createOffersBatchAction(Array.from({ length: 51 }, () => payloads('Bar')[0]));
  expect(result).toMatchObject({ success: false, error: expect.stringContaining('50') });
  expect(getUser).not.toHaveBeenCalled();
  expect(createClient).not.toHaveBeenCalled();
});

it('accepts exactly 50 offers', async () => {
  const result = await createOffersBatchAction(Array.from({ length: 50 }, () => payloads('Bar')[0]));
  expect(result.success).toBe(true);
  if (result.success) expect(result.data.created).toHaveLength(50);
});

it('rejects an empty batch without writes', async () => {
  vi.mocked(createClient).mockClear();
  expect(await createOffersBatchAction([])).toMatchObject({ success: false });
  expect(createClient).not.toHaveBeenCalled();
});
