'use server';

import { lunchImportRequestSchema } from '@/lib/validations/lunch-import';
import { getAdmin } from '@/lib/auth';
import { resolveImportSource } from '@/lib/lunch-import/bindings';
import type { ImportPreviewResult } from '@/lib/lunch-import/types';
import { fetchMenuHtml } from '@/services/lunch-import/fetch-html';
import { fetchGenericHtml } from '@/services/lunch-import/fetch-generic-html';
import { extractGenericMenu } from '@/services/lunch-import/generic-html';
import { extractSofaMenu } from '@/services/lunch-import/sofa';
import { extractSushiMenu } from '@/services/lunch-import/sushi';
import { analyzeText } from '@/services/ai-analyzer';
import { EXTRACTION_ERROR_MESSAGES } from '@/lib/ai/extraction-errors';
import { MAX_AI_TEXT_LENGTH } from '@/lib/ai/constants';
import { createImportReview } from '@/services/lunch-import/review';
import { isMeatologiaUrl } from '@/lib/lunch-import/meatologia';
import { readMeatologiaMenu } from '@/services/lunch-import/meatologia';
import { isSushiCornerUrl } from '@/lib/lunch-import/sushi-corner';
import { readSushiCornerMenu } from '@/services/lunch-import/sushi-corner';

export async function previewLunchImport(input: unknown): Promise<ImportPreviewResult> {
  if (!(await getAdmin())) return { success: false, error: 'Brak uprawnień administratora.' };
  const parsed = lunchImportRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Nieprawidłowe źródło importu.' };
  }
  try {
    const resolved = await resolveImportSource(parsed.data.sourceId);
    if (!resolved) return { success: false, error: 'Źródło jest wyłączone lub wymaga potwierdzenia oddziału.' };
    const { source, restaurant } = resolved;
    if (source.id.startsWith('html-') && isMeatologiaUrl(source.url)) {
      const menu = await readMeatologiaMenu(restaurant);
      return { success: true, data: {
        restaurant, sourceUrl: source.url, fetchedAt: menu.fetchedAt, excerpt: menu.excerpt,
        conditions: menu.conditions, date: null, extractionMethod: 'ai', dishes: menu.dishes,
        menuImage: { ...menu.menuImage, dataUrl: menu.imageDataUrl },
        review: createImportReview(source, menu.fetchedAt, menu.dishes),
        warnings: ['Dania i ceny odczytał model z obrazu. Porównaj każdą pozycję z oryginałem.',
          'Sprawdź dni i godziny na obrazie. Data pobrania oraz nazwa pliku nie określają daty ważności.',
          'Niezmienione menu nie potwierdza dostępności na dziś. Wybierz i potwierdź datę przed publikacją.'],
      } };
    }
    if (source.id.startsWith('html-') && isSushiCornerUrl(source.url)) {
      const menu = await readSushiCornerMenu(restaurant);
      return { success: true, data: {
        restaurant, sourceUrl: source.url, fetchedAt: menu.fetchedAt, excerpt: menu.excerpt,
        conditions: menu.conditions, date: null, extractionMethod: 'ai', dishes: menu.dishes,
        menuPdf: { ...menu.menuPdf, dataUrl: menu.pdfDataUrl },
        review: createImportReview(source, menu.fetchedAt, menu.dishes),
        warnings: ['Dania i ceny odczytał model z PDF. Porównaj każdą pozycję i dopłatę z pobranym oryginałem.',
          'Data pobrania, ścieżka pliku i niezmieniony PDF nie potwierdzają aktualności menu.',
          'Potwierdź dostępność, dni, godziny, kanał sprzedaży i datę przed publikacją.'],
      } };
    }
    const generic = source.id.startsWith('html-');
    const html = generic ? (await fetchGenericHtml(source.url)).html : await fetchMenuHtml(source.id as 'sofa' | 'sushi');
    const fetchedAt = new Date().toISOString();
    const genericExtraction = generic ? extractGenericMenu(html) : null;
    if (genericExtraction && !genericExtraction.supported) throw new Error(genericExtraction.limitations.join(' '));
    const extracted = genericExtraction ?? (source.id === 'sofa' ? extractSofaMenu(html) : extractSushiMenu(html));
    const { excerpt, conditions, dishes: sourceDishes } = extracted;
    const inputText = `Restauracja: ${restaurant.name}\nAdres: ${restaurant.address}\n\n${excerpt}`;
    // Preserve the complete source evidence rather than truncating a dish or price.
    const tooLong = inputText.length > MAX_AI_TEXT_LENGTH;
    const result = tooLong ? null : await analyzeText(inputText);
    const fallbackReason = tooLong
      ? 'Menu zbyt długie do analizy AI. Wyświetlamy pełny odczyt HTML.'
      : result?.message === EXTRACTION_ERROR_MESSAGES.unavailable ? EXTRACTION_ERROR_MESSAGES.unavailable : null;
    const sourceFallback = fallbackReason !== null;
    if (result?.message && !sourceFallback) {
      // Only forward the analyzer's allowlisted product messages, never a raw
      // provider response that could contain source text or request metadata.
      const knownMessage = Object.values(EXTRACTION_ERROR_MESSAGES).find(message => message === result.message);
      throw new Error(knownMessage ?? 'Analiza AI nie powiodła się. Spróbuj ponownie.');
    }
    return {
      success: true,
      data: {
        restaurant,
        sourceUrl: source.url,
        fetchedAt,
        excerpt,
        conditions,
        date: null,
        review: createImportReview(source, fetchedAt, sourceDishes),
        extractionMethod: sourceFallback ? 'html' : 'ai',
        dishes: sourceFallback ? sourceDishes : (result?.offers ?? []).flatMap(offer => offer.dishes).map(dish => ({
          name: dish.name, price: dish.price, description: dish.description, items: dish.items,
        })),
        warnings: [
          ...(fallbackReason ? [fallbackReason,
            'Wyświetlamy dane odczytane bezpośrednio ze strony, bez analizy AI. Sprawdź nazwy, opisy i ceny.'] : []),
          'Źródło nie podaje daty menu. Dostępność i datę trzeba potwierdzić przed publikacją.',
          'Porównaj dania, ceny i alternatywy z fragmentem źródła. Data pobrania nie jest datą ważności menu.',
          'Tagi dietetyczne i alergeny wygenerowane przez AI nie są potwierdzonymi danymi źródła.',
          ...(source.id === 'sushi' ? ['Sprawdź kanał sprzedaży. Informacja o opakowaniu pochodzi z sekcji dostawy; nie doliczamy opłaty do ceny menu.'] : []),
        ],
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Nie udało się przygotować podglądu.' };
  }
}
