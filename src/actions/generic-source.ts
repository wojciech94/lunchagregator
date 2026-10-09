'use server';

import { revalidatePath } from 'next/cache';
import { getAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { genericSourceSchema } from '@/lib/validations/generic-source';
import type { ImportBinding } from '@/lib/lunch-import/binding-state';
import type { ActionResult } from '@/services/offers';
import { fetchGenericHtml, validateGenericUrl } from '@/services/lunch-import/fetch-generic-html';
import { extractGenericMenu } from '@/services/lunch-import/generic-html';

export async function configureGenericSource(input: unknown): Promise<ActionResult<ImportBinding>> {
  if (!(await getAdmin())) return { success: false, error: 'Brak uprawnień administratora.' };
  const parsed = genericSourceSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Sprawdź dane.' };
  const data = parsed.data;
  try {
    const client = await createClient();
    let trial = null;
    const url = data.action === 'draft' ? validateGenericUrl(data.url!).href : null;
    if (data.action === 'trial') {
      const { data: binding, error } = await client.from('lunch_import_bindings').select('*')
        .eq('source_id', `html-${data.restaurantId}`).single();
      if (error || binding.revision !== data.revision || binding.restaurant_id !== data.restaurantId) throw new Error('Konfiguracja zmieniła się. Odśwież stronę.');
      try {
        const fetched = await fetchGenericHtml(binding.source_url);
        const extracted = extractGenericMenu(fetched.html);
        trial = { ...extracted, fetchedAt: new Date().toISOString(), finalUrl: fetched.finalUrl };
      } catch (error) {
        trial = { supported: false, excerpt: '', identityEvidence: '', dishes: [], finalUrl: binding.source_url,
          fetchedAt: new Date().toISOString(), limitations: [error instanceof Error ? error.message : 'Nie udało się odczytać HTML.'] };
      }
    }
    const { data: binding, error } = await client.rpc('configure_generic_import_source', {
      p_restaurant_id: data.restaurantId, p_revision: data.revision, p_action: data.action,
      p_expected_name: data.expectedName, p_expected_address: data.expectedAddress,
      p_url: url, p_trial: trial, p_evidence: data.evidence ?? '', p_confirmed: data.confirmed === true,
    });
    if (error || !binding) return { success: false, error: 'Nie zapisano źródła. Odśwież stronę; po zmianie danych lokalu zapisz szkic ponownie. Sprawdź aktualny podgląd i potwierdzenie.' };
    revalidatePath(`/restaurants/${data.restaurantId}`); revalidatePath('/admin/import'); revalidatePath('/admin/logs');
    return { success: true, data: binding };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Nie zapisano źródła.' }; }
}
