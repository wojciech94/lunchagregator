'use server';

import { revalidatePath } from 'next/cache';
import { getAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { importPublicationSchema } from '@/lib/validations/lunch-import';
import { verifyImportReceipt } from '@/services/lunch-import/receipt';
import { createOffer, type ActionResult } from '@/services/offers';
import type { ImportPublicationSummary } from '@/lib/lunch-import/types';

export async function publishLunchImport(input: unknown): Promise<ActionResult<ImportPublicationSummary>> {
  const admin = await getAdmin();
  if (!admin) return { success: false, error: 'Brak uprawnień administratora.' };
  const parsed = importPublicationSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Sprawdź dane publikacji.' };
  try {
    const { availableDate, dishes } = parsed.data;
    const receipt = verifyImportReceipt(parsed.data.receipt);
    if (new Set(dishes.map(dish => dish.itemKey)).size !== dishes.length
      || dishes.some(dish => !receipt.itemKeys.includes(dish.itemKey))) {
      return { success: false, error: 'Pozycje nie odpowiadają pobranemu menu. Pobierz je ponownie.' };
    }
    const client = await createClient();
    const { data: restaurant, error } = await client.from('restaurants').select('id,name,address')
      .eq('id', receipt.restaurantId).single();
    if (error || !restaurant || restaurant.name !== receipt.name || restaurant.address !== receipt.address) {
      return { success: false, error: 'Dane lokalu zmieniły się. Pobierz menu ponownie.' };
    }
    const summary: ImportPublicationSummary = { saved: [], failed: [] };
    for (const dish of dishes) {
      try {
        const result = await createOffer({ dishName: dish.dishName.trim(), price: dish.price,
          description: dish.description, items: dish.items, availableDate,
          restaurantId: restaurant.id, restaurantName: restaurant.name, restaurantAddress: restaurant.address,
          sourceType: 'link', dietaryTags: [], allergens: [], cuisineType: null,
        }, admin.id, { inferCuisine: false, import: { sourceId: receipt.sourceId,
          itemKey: dish.itemKey, fetchedAt: receipt.fetchedAt, expectedName: receipt.name, expectedAddress: receipt.address } });
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
