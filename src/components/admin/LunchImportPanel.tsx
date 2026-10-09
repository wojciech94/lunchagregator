'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { previewLunchImport } from '@/actions/lunch-import';
import type { ImportPreviewResult } from '@/lib/lunch-import/types';
import type { AnySourceId } from '@/lib/lunch-import/sources';
import { LunchImportReview } from './LunchImportReview';

export function LunchImportPanel({ enabled, sourceId = 'sofa', name = 'Sofa Lounge & Restaurant', address = 'al. Paderewskiego 35, Wrocław', label = 'Sofa' }: {
  enabled: boolean; sourceId?: AnySourceId; name?: string; address?: string; label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<ImportPreviewResult | null>(null);

  async function load() {
    setBusy(true);
    setResult(null);
    try { setResult(await previewLunchImport({ sourceId })); }
    catch { setResult({ success: false, error: 'Brak połączenia. Spróbuj ponownie.' }); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-lg font-semibold">{name}</h2>
        <p className="text-sm text-muted-foreground">{address}</p>
        {!enabled && <p role="alert">Źródło {label} nie zostało jeszcze przypisane do restauracji.</p>}
        <Button onClick={load} disabled={!enabled || busy || publishing}>{busy ? `Pobieranie i analiza ${label}…` : `Pobierz menu ${label}`}</Button>
        <p className="text-sm text-muted-foreground" role="status">{busy ? 'Przygotowanie podglądu może potrwać do 35 sekund.' : 'Podgląd nie zapisuje ani nie publikuje ofert.'}</p>
      </div>
      {result && !result.success && <p role="alert" className="text-destructive">{result.error}</p>}
      {result?.success && <div className="space-y-4">
        <div className="rounded-lg border border-border p-4 space-y-2">
          <Link href={`/restaurants/${result.data.restaurant.id}`} className="underline">{result.data.restaurant.name}</Link>
          <p className="text-sm">{result.data.restaurant.address}</p>
          <a href={result.data.sourceUrl} target="_blank" rel="noreferrer" className="underline break-all">Otwórz źródło menu</a>
          <p className="text-sm">Pobrano: {new Date(result.data.fetchedAt).toLocaleString('pl-PL')}</p>
          <p className="font-medium">Data menu: nieznana</p>
          <p className="text-sm">Sposób odczytu: {result.data.extractionMethod === 'html' ? 'bezpośrednio ze strony (bez analizy AI)' : 'analiza AI'}</p>
          <ul className="list-disc pl-5 text-sm space-y-1">{result.data.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
        </div>
        <h2 className="text-lg font-semibold">{result.data.extractionMethod === 'html' ? 'Dania odczytane ze strony' : 'Dania rozpoznane przez AI'}</h2>
        {result.data.dishes.length === 0 && <p role="status">Analiza zakończyła się poprawnie, ale nie rozpoznano ofert lunchowych. Sprawdź fragment źródła.</p>}
        <ul className="space-y-3">{result.data.dishes.map((dish, index) => <li key={index} className="rounded-lg border border-border p-4 space-y-2">
          <h3 className="font-medium">{dish.name || 'Brak nazwy dania'}</h3>
          <p>{dish.price !== null && Number.isFinite(dish.price) && dish.price > 0 ? `${dish.price.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł` : 'Brak prawidłowej ceny — wymaga uzupełnienia'}</p>
          {dish.description && <p className="text-sm">{dish.description}</p>}
          {!!dish.items?.length && <ul className="list-disc pl-5 text-sm">{dish.items.map((item, i) => <li key={i}>{item}</li>)}</ul>}
        </li>)}</ul>
        <details open className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer font-medium">Fragment menu ze źródła</summary>
          <pre className="mt-3 whitespace-pre-wrap break-words text-sm font-sans">{result.data.excerpt}</pre>
        </details>
        {result.data.review ? <LunchImportReview key={result.data.review.fetchedAt} review={result.data.review} onBusyChange={setPublishing} />
          : <p>Publikacja niedostępna: źródło musi zawierać jednoznaczne nazwy pozycji.</p>}
      </div>}
    </div>
  );
}
