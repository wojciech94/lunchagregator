'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { publishLunchImport } from '@/actions/publish-lunch-import';
import { importPublicationSchema } from '@/lib/validations/lunch-import';
import type { ImportPublicationSummary, LunchImportPreview } from '@/lib/lunch-import/types';

export function LunchImportReview({ review, onBusyChange }: {
  review: NonNullable<LunchImportPreview['review']>; onBusyChange: (busy: boolean) => void;
}) {
  const id = useId();
  const [rows, setRows] = useState(() => review.dishes.map(dish => ({ itemKey: dish.itemKey,
    selected: true, dishName: dish.name ?? '', price: dish.price === null ? '' : String(dish.price),
    description: dish.description ?? '', items: (dish.items ?? []).join('\n') })));
  const [date, setDate] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [saved, setSaved] = useState<ImportPublicationSummary['saved']>([]);
  const [failed, setFailed] = useState<ImportPublicationSummary['failed']>([]);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const maxDate = new Date(`${today}T00:00:00Z`); maxDate.setUTCDate(maxDate.getUTCDate() + 30);
  const pending = rows.filter(row => row.selected && !saved.some(item => item.itemKey === row.itemKey));

  function edit(index: number, patch: Partial<typeof rows[number]>) {
    setRows(current => current.map((row, i) => i === index ? { ...row, ...patch } : row));
    setConfirmed(false);
  }

  async function publish() {
    const input = { sourceId: review.sourceId, restaurantId: review.restaurantId, fetchedAt: review.fetchedAt, availableDate: date, confirmed,
      dishes: pending.map(row => ({ itemKey: row.itemKey, dishName: row.dishName,
        price: Number(row.price.replace(',', '.')), description: row.description,
        items: row.items.split('\n').map(item => item.trim()).filter(Boolean) })) };
    const parsed = importPublicationSchema.safeParse(input);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Sprawdź dane.'); return; }
    setBusy(true); onBusyChange(true); setAttempted(true); setError(null);
    try {
      const result = await publishLunchImport(input);
      if (!result.success) { setError(result.error); return; }
      setSaved(current => [...current, ...result.data.saved]);
      setFailed(result.data.failed);
    } catch {
      setError('Nie otrzymano potwierdzenia zapisu. Ponów te same pozycje — zapisane zostaną pominięte.');
    } finally { setBusy(false); onBusyChange(false); }
  }

  return <section className="space-y-4 rounded-lg border border-border p-4" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="text-lg font-semibold">Sprawdź i zatwierdź publikację</h2>
    <p>Formularz zawiera pozycje odczytane bezpośrednio ze źródła. Porównaj je z podglądem AI i fragmentem menu. Zachowaj alternatywy zestawów i wyjaśnij ceny oraz kanał sprzedaży. Nie dodajemy zgadywanych tagów ani alergenów.</p>
    <p>Podgląd można zatwierdzić przez 30 minut od pobrania. Zapisane oferty i ich ręczne korekty nie zostaną nadpisane.</p>
    <label className="block space-y-1" htmlFor={`${id}-date`}>Potwierdzona data dostępności
      <Input id={`${id}-date`} type="date" value={date} min={today} max={maxDate.toISOString().slice(0, 10)}
        disabled={busy || attempted} onChange={event => { setDate(event.target.value); setConfirmed(false); }} />
    </label>
    {attempted && <p>Data jest zablokowana dla ponowień tej publikacji. Inny dzień wymaga nowego podglądu.</p>}
    {rows.map((row, index) => {
      const status = saved.find(item => item.itemKey === row.itemKey);
      const failure = failed.find(item => item.itemKey === row.itemKey);
      return <fieldset key={row.itemKey} disabled={busy || !!status} className="space-y-3 rounded-lg border border-border p-3">
        <legend>Pozycja {index + 1}</legend>
        <label className="flex gap-2"><input type="checkbox" checked={row.selected}
          onChange={event => edit(index, { selected: event.target.checked })} />Uwzględnij pozycję {index + 1}</label>
        <label className="block" htmlFor={`${id}-name-${index}`}>Nazwa dania
          <Input id={`${id}-name-${index}`} value={row.dishName} onChange={event => edit(index, { dishName: event.target.value })} />
        </label>
        <label className="block" htmlFor={`${id}-price-${index}`}>Cena w PLN
          <Input id={`${id}-price-${index}`} inputMode="decimal" value={row.price} onChange={event => edit(index, { price: event.target.value })} />
        </label>
        <label className="block" htmlFor={`${id}-description-${index}`}>Opis i warunki
          <Textarea id={`${id}-description-${index}`} value={row.description} onChange={event => edit(index, { description: event.target.value })} />
        </label>
        <label className="block" htmlFor={`${id}-items-${index}`}>Skład zestawu i alternatywy — każda pozycja w osobnym wierszu
          <Textarea id={`${id}-items-${index}`} value={row.items} onChange={event => edit(index, { items: event.target.value })} />
        </label>
        {status && <p role="status">{status.existing ? 'Już opublikowano — zachowano istniejącą ofertę.' : 'Zapisano.'} <Link className="underline" href={`/offers/${status.offerId}`}>Otwórz ofertę</Link>
          {status.missingCoordinates && ' Brak współrzędnych — oferta nie pojawi się w wyszukiwaniu po odległości.'}</p>}
        {failure && !status && <p role="alert">{failure.error}</p>}
      </fieldset>;
    })}
    <label className="flex gap-2"><input type="checkbox" checked={confirmed} disabled={busy || pending.length === 0}
      onChange={event => setConfirmed(event.target.checked)} />Potwierdzam dostępność w wybranym dniu, nazwy, ceny, alternatywy i kanał sprzedaży. Zatwierdzam publikację.</label>
    {error && <p role="alert">{error}</p>}
    <p role="status">Zapisane lub istniejące: {saved.length}. Nieudane: {failed.length}.</p>
    <Button disabled={busy || !date || !confirmed || pending.length === 0} onClick={publish}>
      {busy ? 'Publikowanie…' : attempted ? 'Ponów niezapisane pozycje' : 'Opublikuj zatwierdzone pozycje'}
    </Button>
  </section>;
}
