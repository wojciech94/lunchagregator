'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { configureImportBinding } from '@/actions/import-bindings';
import { IMPORT_SOURCES, type SourceId } from '@/lib/lunch-import/sources';
import { bindingIsActive, type ImportBinding } from '@/lib/lunch-import/binding-state';
import { sameImportIdentity } from '@/lib/lunch-import/identity';
import { LunchImportPanel } from './LunchImportPanel';

export function RestaurantImportSettings({ restaurant, bindings }: {
  restaurant: { id: string; name: string; address: string }; bindings: ImportBinding[];
}) {
  const own = bindings.find(binding => binding.restaurant_id === restaurant.id);
  const [sourceId, setSourceId] = useState<SourceId>(own?.source_id ?? 'sofa');
  const [currentBindings, setBindings] = useState(bindings);
  const [evidence, setEvidence] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const id = useId();
  const source = IMPORT_SOURCES[sourceId];
  const binding = currentBindings.find(row => row.source_id === sourceId);
  const elsewhere = binding && binding.restaurant_id !== restaurant.id;
  const active = !!binding && !elsewhere && bindingIsActive(binding, restaurant);
  const discrepancy = !sameImportIdentity(restaurant, { name: source.restaurantName, address: source.branchAddress });

  async function save(action: 'confirm' | 'disable') {
    setBusy(true); setError(null); setNotice(null);
    try {
      const base = { restaurantId: restaurant.id, sourceId, revision: binding?.revision ?? null,
        expectedName: restaurant.name, expectedAddress: restaurant.address };
      const result = await configureImportBinding(action === 'confirm'
        ? { ...base, action, evidence, confirmed } : { ...base, action });
      if (!result.success) { setError(result.error); return; }
      setBindings(rows => [...rows.filter(row => row.source_id !== sourceId), result.data]);
      setConfirmed(false); setEvidence('');
      setNotice(action === 'confirm' ? 'Potwierdzono oddział i włączono import.' : 'Import wyłączony. Istniejące oferty pozostają zapisane.');
    } catch { setError('Brak potwierdzenia zapisu. Odśwież stronę przed ponowieniem.'); }
    finally { setBusy(false); }
  }

  return <section className="mt-8 space-y-4 rounded-lg border p-4" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="text-xl font-semibold">Import menu — ustawienia Admina</h2>
    <p>Potwierdź, że oficjalne menu dotyczy tego oddziału. Włączenie importu nie publikuje ofert.</p>
    <label className="block" htmlFor={`${id}-source`}>Obsługiwane źródło
      <select id={`${id}-source`} className="mt-1 block w-full rounded border bg-background p-2"
        value={sourceId} disabled={busy} onChange={event => {
          setSourceId(event.target.value as SourceId); setEvidence(''); setConfirmed(false); setNotice(null); setError(null);
        }}>
        {Object.values(IMPORT_SOURCES).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><h3 className="font-semibold">Restauracja w aplikacji</h3><p>{restaurant.name}</p><p>{restaurant.address}</p></div>
      <div><h3 className="font-semibold">Oddział wskazany dla źródła</h3><p>{source.restaurantName}</p><p>{source.branchAddress}</p>
        <a className="underline" href={source.url} target="_blank" rel="noreferrer">Sprawdź oficjalne źródło</a></div>
    </div>
    {discrepancy && <p role="alert">Nazwa lub adres różni się od danych źródła. Wyjaśnij różnicę i potwierdź dokładny oddział. Jeśli menu dotyczy innego lokalu lub nie da się tego ustalić, pozostaw import wyłączony.</p>}
    {elsewhere ? <p role="alert">To źródło jest już powiązane z inną restauracją. <Link className="underline" href={`/restaurants/${binding.restaurant_id}`}>Otwórz przypisaną restaurację</Link>.</p> : <>
      <p role="status">Status: {active ? 'aktywny' : 'wyłączony lub wymaga ponownego potwierdzenia'}.</p>
      {binding?.verified_at && <p className="text-sm">Ostatnia weryfikacja: {new Date(binding.verified_at).toLocaleString('pl-PL')}. {binding.verification_note}</p>}
      <label className="block" htmlFor={`${id}-evidence`}>Podstawa potwierdzenia oddziału i wyjaśnienie różnic
        <Textarea id={`${id}-evidence`} maxLength={1000} value={evidence} disabled={busy}
          onChange={event => { setEvidence(event.target.value); setConfirmed(false); }} />
      </label>
      <label className="flex gap-2"><input type="checkbox" checked={confirmed} disabled={busy}
        onChange={event => setConfirmed(event.target.checked)} />Sprawdziłem oficjalne źródło. Menu dotyczy dokładnie tego oddziału; wyjaśniłem różnice i nie ma nierozstrzygniętej niepewności.</label>
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy || !confirmed || evidence.trim().length < 10} onClick={() => save('confirm')}>Potwierdź oddział i włącz import</Button>
        {binding?.enabled && <Button variant="outline" disabled={busy} onClick={() => save('disable')}>Wyłącz import</Button>}
      </div>
      {active && <LunchImportPanel key={binding.revision} enabled sourceId={sourceId}
        name={restaurant.name} address={restaurant.address} label={source.label} />}
    </>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}
