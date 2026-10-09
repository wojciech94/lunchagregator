'use server';

import { revalidatePath } from 'next/cache';
import { getAdmin } from '@/lib/auth';
import { importPublicationSchema } from '@/lib/validations/lunch-import';
import { resolveImportSource } from '@/lib/lunch-import/bindings';
import { createOffer, type ActionResult } from '@/services/offers';
import type { ImportPublicationSummary } from '@/lib/lunch-import/types';

export async function publishLunchImport(input: unknown): Promise<ActionResult<ImportPublicationSummary>> {
  const admin = await getAdmin();
  if (!admin) return { success: false, error: 'Brak uprawnień administratora.' };
  const parsed = importPublicationSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Sprawdź dane publikacji.' };
  try {
    const { availableDate, dishes, fetchedAt } = parsed.data;
    const previewAge = Date.now() - Date.parse(fetchedAt);
    if (previewAge > 30 * 60 * 1000 || previewAge < -60000) {
      return { success: false, error: 'Podgląd wygasł. Pobierz menu ponownie.' };
    }
    const resolved = await resolveImportSource(parsed.data.sourceId);
    if (!resolved || resolved.source.restaurantId !== parsed.data.restaurantId
      || resolved.source.bindingRevision !== parsed.data.bindingRevision) {
      return { success: false, error: 'Konfiguracja źródła zmieniła się. Pobierz menu ponownie.' };
    }
    // Admin-reviewed metadata is trusted input, not a cryptographic proof of origin.
    if (new Set(dishes.map(dish => dish.itemKey)).size !== dishes.length) {
      return { success: false, error: 'Pozycje nie odpowiadają pobranemu menu. Pobierz je ponownie.' };
    }
    const { source, restaurant } = resolved;
    const summary: ImportPublicationSummary = { saved: [], failed: [] };
    for (const dish of dishes) {
      try {
        const result = await createOffer({ dishName: dish.dishName.trim(), price: dish.price,
          description: dish.description, items: dish.items, availableDate,
          restaurantId: restaurant.id, restaurantName: restaurant.name, restaurantAddress: restaurant.address,
          sourceType: 'link', dietaryTags: [], allergens: [], cuisineType: null,
        }, admin.id, { inferCuisine: false, import: { sourceId: source.id,
          itemKey: dish.itemKey, fetchedAt, bindingRevision: source.bindingRevision,
          expectedName: restaurant.name, expectedAddress: restaurant.address } });
        if (result.success) summary.saved.push({ itemKey: dish.itemKey, offerId: result.data.id,
          existing: !!result.alreadyImported, missingCoordinates: !!result.locationWarning });
        else summary.failed.push({ itemKey: dish.itemKey, error: result.error });
      } catch {
        summary.failed.push({ itemKey: dish.itemKey, error: 'Nie udało się zapisać pozycji. Ponów tylko nieudane pozycje.' });
      }
    }
    if (summary.saved.length) {
      revalidatePath('/'); revalidatePath('/admin/offers'); revalidatePath(`/restaurants/${restaurant.id}`);
    }
    return { success: true, data: summary };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Nie udało się opublikować menu.' };
  }
}
