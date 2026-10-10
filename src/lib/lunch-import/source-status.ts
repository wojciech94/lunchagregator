import type { ImportBinding } from './binding-state';
import { sameImportIdentity } from './identity';

/** Configuration state only: an active binding is not a claim of menu freshness. */
export function importSourceStatus(binding: ImportBinding, resolved: boolean, restaurant: { name: string; address: string | null } | null) {
  if (resolved) return 'Aktywna konfiguracja — menu wymaga sprawdzenia';
  if (binding.enabled) return 'Wymaga ponownej weryfikacji';
  if (binding.verified_at && (!restaurant?.address?.trim() || !binding.verified_by
    || !sameImportIdentity({ name: restaurant.name, address: restaurant.address }, { name: binding.verified_name, address: binding.verified_address }))) return 'Wymaga ponownej weryfikacji';
  if (binding.verified_at) return 'Wyłączone';
  if (binding.trial && (!binding.trial.supported || binding.trial.limitations.length)) return 'Próba nieobsługiwana — sprawdź błąd źródła';
  if (binding.trial) return 'Próba odczytu — wymaga potwierdzenia';
  return 'Szkic — wymaga weryfikacji';
}
