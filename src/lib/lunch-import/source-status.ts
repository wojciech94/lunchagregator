import type { ImportBinding } from './binding-state';

/** Configuration state only: an active binding is not a claim of menu freshness. */
export function importSourceStatus(binding: ImportBinding, resolved: boolean) {
  if (resolved) return 'Aktywna konfiguracja — menu wymaga sprawdzenia';
  if (binding.enabled) return 'Wymaga ponownej weryfikacji';
  if (binding.verified_at) return 'Wyłączone';
  if (binding.trial && (!binding.trial.supported || binding.trial.limitations.length)) return 'Próba nieobsługiwana — sprawdź błąd źródła';
  if (binding.trial) return 'Próba odczytu — wymaga potwierdzenia';
  return 'Szkic — wymaga weryfikacji';
}
