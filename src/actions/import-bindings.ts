'use server';

import { revalidatePath } from 'next/cache';
import { getAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { ImportBinding } from '@/lib/lunch-import/bindings';
import type { ActionResult } from '@/services/offers';
import { configureImportBindingSchema } from '@/lib/validations/import-binding';

export async function configureImportBinding(input: unknown): Promise<ActionResult<ImportBinding>> {
  if (!(await getAdmin())) return { success: false, error: 'Brak uprawnień administratora.' };
  const parsed = configureImportBindingSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Sprawdź konfigurację.' };
  const data = parsed.data;
  try {
    const client = await createClient();
    // SQL independently checks Admin, current identity and optimistic revision.
    const { data: binding, error } = await client.rpc('configure_lunch_import_binding', {
      p_restaurant_id: data.restaurantId, p_source_id: data.sourceId, p_action: data.action,
      p_revision: data.revision, p_expected_name: data.expectedName, p_expected_address: data.expectedAddress,
      p_evidence: data.action === 'confirm' ? data.evidence : '', p_confirmed: data.action === 'confirm',
    });
    if (error || !binding) return { success: false,
      error: 'Nie zapisano konfiguracji. Odśwież stronę: lokal lub powiązanie mogło się zmienić, albo źródło przypisano już gdzie indziej.' };
    revalidatePath(`/restaurants/${data.restaurantId}`);
    revalidatePath('/admin/import');
    return { success: true, data: binding };
  } catch {
    return { success: false, error: 'Nie udało się zapisać konfiguracji. Sprawdź połączenie i migrację bazy.' };
  }
}
