'use client';

import { useId, useState } from 'react';
import { configureGenericSource } from '@/actions/generic-source';
import { bindingIsActive, type ImportBinding } from '@/lib/lunch-import/binding-state';
import { Button } from '@/components/ui/button';
import { LunchImportPanel } from './LunchImportPanel';

export function GenericSourceSettings({ restaurant, initial }: {
  restaurant: { id: string; name: string; address: string }; initial?: ImportBinding;
}) {
  const id = useId();
  const [binding, setBinding] = useState(initial);
  const [url, setUrl] = useState(initial?.source_url ?? '');
  const [evidence, setEvidence] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changed = url !== binding?.source_url;
  const active = !!binding && bindingIsActive(binding, restaurant);
  async function run(action: 'draft' | 'trial' | 'confirm' | 'disable') {
    setBusy(true); setError('');
    try {
      const result = await configureGenericSource({ restaurantId: restaurant.id, revision: binding?.revision ?? null,
        expectedName: restaurant.name, expectedAddress: restaurant.address, action,
        ...(action === 'draft' ? { url } : {}), ...(action === 'confirm' ? { evidence, confirmed } : {}) });
      if (result.success) { setBinding(result.data); setUrl(result.data.source_url); setConfirmed(false); setEvidence(''); }
      else setError(result.error);
    } catch { setError('Brak potwierdzenia zapisu. Odśwież stronę.'); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4 border-t pt-4" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`} className="text-lg font-semibold">Nowe źródło HTML — pilotaż</h3>
    <p>Obsługujemy jedną sekcję lunchową z nazwanymi pozycjami HTML. PDF, OCR i strony wymagające JavaScript pozostają poza zakresem. Zapis szkicu lub nowa próba wyłącza źródło do ponownej weryfikacji; wcześniejsze importy pozostają chronione.</p>
    <label className="block" htmlFor={`${id}-url`}>Oficjalny URL menu HTTPS
      <input id={`${id}-url`} type="url" maxLength={2000} className="block w-full rounded border bg-background p-2" value={url} disabled={busy}
        onChange={event => { setUrl(event.target.value); setConfirmed(false); }} />
    </label>
    <div className="flex flex-wrap gap-3">
      <Button disabled={busy || !url} onClick={() => run('draft')}>Zapisz szkic źródła</Button>
      <Button variant="outline" disabled={busy || !binding || changed} onClick={() => run('trial')}>Uruchom próbny odczyt HTML</Button>
      {binding?.enabled && <Button variant="outline" disabled={busy} onClick={() => run('disable')}>Wyłącz nowe źródło</Button>}
    </div>
    <p role="status">{busy ? 'Pobieranie lub zapis…' : `Status: ${active ? 'aktywny' : 'szkic / niezweryfikowany'}. Próba nie publikuje ofert.`}</p>
    {binding?.verified_at && <p className="text-sm">Ostatnia weryfikacja: {new Date(binding.verified_at).toLocaleString('pl-PL')}. {binding.verification_note}</p>}
    {binding?.trial && !changed && <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><h4>Restauracja w aplikacji</h4><p>{restaurant.name}</p><p>{restaurant.address}</p></div>
        <div><h4>Faktycznie pobrane źródło</h4><a className="underline break-all" href={binding.trial.finalUrl} target="_blank" rel="noreferrer">{binding.trial.finalUrl}</a>
          <pre className="whitespace-pre-wrap font-sans">{binding.trial.identityEvidence}</pre></div>
      </div>
      <p>Pobrano: {new Date(binding.trial.fetchedAt).toLocaleString('pl-PL')}. Weryfikacja wymaga próby z ostatnich 30 minut.</p>
      <p>Data i dostępność menu wymagają ręcznego potwierdzenia. Brak ceny lub niejasne warianty wymagają korekty albo wykluczenia przed publikacją.</p>
      {binding.trial.limitations.map(message => <p role="alert" key={message}>{message}</p>)}
      <pre className="whitespace-pre-wrap break-words font-sans text-sm">{binding.trial.excerpt}</pre>
      <ul>{binding.trial.dishes.map((dish, index) => <li key={index}>{dish.name}: {dish.price === null ? 'cena do uzupełnienia' : `${dish.price} PLN`}</li>)}</ul>
      {binding.trial.supported && <>
        <label className="block" htmlFor={`${id}-evidence`}>Podstawa potwierdzenia oddziału, aktualności i wyjaśnienie różnic
          <textarea id={`${id}-evidence`} className="block w-full rounded border bg-background p-2" maxLength={1000} value={evidence} disabled={busy}
            onChange={event => { setEvidence(event.target.value); setConfirmed(false); }} />
        </label>
        <label className="flex gap-2"><input type="checkbox" checked={confirmed} disabled={busy}
          onChange={event => setConfirmed(event.target.checked)} />Sprawdziłem oficjalne źródło, aktualność menu i dokładny oddział. Nie ma nierozstrzygniętej niepewności ani wielu oddziałów.</label>
        <Button disabled={busy || !confirmed || evidence.trim().length < 10} onClick={() => run('confirm')}>Zweryfikuj i aktywuj nowe źródło</Button>
      </>}
    </div>}
    {error && <p role="alert">{error}</p>}
    {active && !changed && <LunchImportPanel key={binding.revision} enabled sourceId={binding.source_id} name={restaurant.name} address={restaurant.address} label={binding.source_name} />}
  </section>;
}
