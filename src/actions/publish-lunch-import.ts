'use server';

import { revalidatePath } from 'next/cache';
import { getAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { importPublicationSchema } from '@/lib/validations/lunch-import';
import { getImportSource } from '@/lib/lunch-import/sources';
import { createOffer, type ActionResult } from '@/services/offers';
import type { ImportPublicationSummary } from '@/lib/lunch-import/types';

export async function publishLunchImport(input: unknown): Promise<ActionResult<ImportPublicationSummary>> {
  const admin = await getAdmin();
  if (!admin) return { success: false, error: 'Brak uprawnień administratora.' };
  const parsed = importPublicationSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Sprawdź dane publikacji.' };
  try {
    const { availableDate, dishes, fetchedAt } = parsed.data;
    const source = getImportSource(parsed.data.sourceId);
    if (!source || source.restaurantId !== parsed.data.restaurantId) {
      return { success: false, error: 'Konfiguracja źródła zmieniła się. Pobierz menu ponownie.' };
    }
    // Admin-reviewed metadata is trusted input, not a cryptographic proof of origin.
    if (new Set(dishes.map(dish => dish.itemKey)).size !== dishes.length) {
      return { success: false, error: 'Pozycje nie odpowiadają pobranemu menu. Pobierz je ponownie.' };
    }
    const client = await createClient();
    const { data: restaurant, error } = await client.from('restaurants').select('id,name,address')
      .eq('id', source.restaurantId).single();
    if (error || !restaurant || restaurant.name !== source.restaurantName || restaurant.address !== source.branchAddress) {
      return { success: false, error: 'Dane lokalu zmieniły się. Pobierz menu ponownie.' };
    }
    const summary: ImportPublicationSummary = { saved: [], failed: [] };
    for (const dish of dishes) {
      try {
        const result = await createOffer({ dishName: dish.dishName.trim(), price: dish.price,
          description: dish.description, items: dish.items, availableDate,
          restaurantId: restaurant.id, restaurantName: restaurant.name, restaurantAddress: restaurant.address,
          sourceType: 'link', dietaryTags: [], allergens: [], cuisineType: null,
        }, admin.id, { inferCuisine: false, import: { sourceId: source.id,
          itemKey: dish.itemKey, fetchedAt, expectedName: source.restaurantName, expectedAddress: source.branchAddress } });
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
