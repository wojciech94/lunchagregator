import { createClient } from '@/lib/supabase/server';
import { fixedSource, type ImportSource, type AnySourceId } from './sources';
import { bindingIsActive, type ImportBinding } from './binding-state';
export type { ImportBinding } from './binding-state';

export async function listImportBindings(): Promise<ImportBinding[]> {
  const client = await createClient();
  const { data, error } = await client.from('lunch_import_bindings').select('*');
  if (error) throw new Error('Nie można odczytać konfiguracji importu. Sprawdź migrację bazy.');
  return data ?? [];
}

/** Session client and RLS; no environment UUID fallback. */
export async function resolveImportSource(sourceId: AnySourceId): Promise<{
  source: ImportSource; restaurant: { id: string; name: string; address: string };
} | null> {
  const client = await createClient();
  const { data: binding, error } = await client.from('lunch_import_bindings').select('*')
    .eq('source_id', sourceId).maybeSingle();
  if (error) throw new Error('Nie można odczytać konfiguracji importu. Sprawdź migrację bazy.');
  if (!binding) return null;
  const { data: restaurant, error: restaurantError } = await client.from('restaurants').select('id,name,address')
    .eq('id', binding.restaurant_id).single();
  if (restaurantError || !restaurant || !bindingIsActive(binding, restaurant)) return null;
  return { restaurant, source: { ...(fixedSource(sourceId) ?? { id: sourceId, label: binding.source_name, url: binding.source_url, restaurantName: binding.source_name, branchAddress: binding.source_address }), restaurantId: restaurant.id, bindingRevision: binding.revision } };
}
