'use server';

import { lunchImportRequestSchema } from '@/lib/validations/lunch-import';
import { getAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getImportSource } from '@/lib/lunch-import/sources';
import type { ImportPreviewResult } from '@/lib/lunch-import/types';
import { fetchMenuHtml } from '@/services/lunch-import/fetch-html';
import { extractSofaMenu } from '@/services/lunch-import/sofa';
import { extractSushiMenu } from '@/services/lunch-import/sushi';
import { analyzeText } from '@/services/ai-analyzer';
import { EXTRACTION_ERROR_MESSAGES } from '@/lib/ai/extraction-errors';

export async function previewLunchImport(input: unknown): Promise<ImportPreviewResult> {
  if (!(await getAdmin())) return { success: false, error: 'Brak uprawnień administratora.' };
  const parsed = lunchImportRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Nieprawidłowe źródło importu.' };
  }
  const source = getImportSource(parsed.data.sourceId);
  if (!source) return { success: false, error: 'Źródło nie zostało przypisane do restauracji.' };
  try {
    const client = await createClient();
    const { data: restaurant, error } = await client.from('restaurants')
      .select('id,name,address').eq('id', source.restaurantId).single();
    if (error || !restaurant) throw new Error('Nie można odczytać przypisanej restauracji.');
    if (restaurant.name !== source.restaurantName || restaurant.address !== source.branchAddress) {
      throw new Error('Dane przypisanego lokalu zmieniły się. Sprawdź konfigurację źródła.');
    }
    const html = await fetchMenuHtml(source.id);
    const fetchedAt = new Date().toISOString();
    const adapter = source.id === 'sofa' ? extractSofaMenu : extractSushiMenu;
    const { excerpt, conditions, dishes: sourceDishes } = adapter(html);
    const result = await analyzeText(`Restauracja: ${restaurant.name}\nAdres: ${restaurant.address}\n\n${excerpt}`);
    const sourceFallback = result.message === EXTRACTION_ERROR_MESSAGES.unavailable;
    if (result.message && !sourceFallback) {
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
        extractionMethod: sourceFallback ? 'html' : 'ai',
        dishes: sourceFallback ? sourceDishes : result.offers.flatMap(offer => offer.dishes).map(dish => ({
          name: dish.name, price: dish.price, description: dish.description, items: dish.items,
        })),
        warnings: [
          ...(sourceFallback ? [EXTRACTION_ERROR_MESSAGES.unavailable,
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
