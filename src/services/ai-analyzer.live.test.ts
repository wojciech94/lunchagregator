import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeText } from './ai-analyzer';
import { validateExtraction } from '@/lib/validations/extraction';

// Explicit opt-in: normal test runs never send data to an external provider.
describe.skipIf(process.env.RUN_AI_LIVE !== '1')('live extraction regression (#89)', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    'Restauracja Pizza Si, Wojciecha Bogusławskiego 89, Wrocław. Lunch: zupa pomidorowa i pizza Margherita, 34 PLN, wegetariański, kuchnia włoska. Oferta dostępna 6 października 2026, od 12:00 do 15:00.',
    'Restauracja: Pizza Si. Adres: Wojciecha Bogusławskiego 89, Wrocław. Menu lunchowe: Pizza Margherita + lemoniada. Cena zestawu: 34 zł.',
  ])('extracts the reported text %#', async (text) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const extraction = await analyzeText(text);
    const result = validateExtraction(extraction);
    expect(result.prefilledData.length, extraction.message ?? 'No usable offers').toBeGreaterThan(0);
    expect(result.prefilledData[0].restaurantName).toMatch(/Pizza Si/i);
    expect(result.prefilledData[0].dishes.some((dish) => dish.price === 34)).toBe(true);
    expect(result.prefilledData[0].dishes.some((dish) => /margherita/i.test(dish.name ?? ''))).toBe(true);
  }, 20000);

  it('extracts separate days from a weekly menu', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await analyzeText('Restauracja Pizza Si, Wrocław. Menu tygodniowe: Poniedziałek: Margherita + lemoniada, 34 zł. Wtorek: pomidorowa + penne, 35 zł. Środa: risotto grzybowe, 32 zł.');
    expect(result.offers.length, result.message ?? 'No offers').toBeGreaterThan(0);
    expect(new Set(result.offers[0].dishes.map(dish => dish.dayOfWeek))).toEqual(new Set(['monday', 'tuesday', 'wednesday']));
  }, 20000);
});
