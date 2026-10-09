'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MenuEditor } from './MenuEditor';
import { setMenuActiveAction, setMenuExceptionAction } from '@/actions/menus';
import { menuDates, menuDayLabels, menuToday, type MenuContent, type MenuDish, type MenuRevision } from '@/lib/recurring-menu';
import type { AssignedRestaurant } from '@/lib/restaurant-match';

export function MenuManager({ restaurant, active, revisions, exceptions, setupContent, sourceIds, generationFailed, legacyFlag }: {
  restaurant: AssignedRestaurant; active: boolean | null; revisions: MenuRevision[];
  exceptions: { date: string; kind: 'closed' | 'replacement'; dishes: MenuDish[] | null }[];
  setupContent: MenuContent; sourceIds: string[]; generationFailed: boolean; legacyFlag: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'summary' | 'edit' | 'exception'>('summary');
  const [date, setDate] = useState(menuToday());
  const [replacement, setReplacement] = useState(false);
  const [replacementContent, setReplacementContent] = useState<MenuContent>({ kind: 'fixed', entries: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingRevision, setEditingRevision] = useState<MenuRevision | null>(null);
  const current = revisions.filter(r => r.effectiveFrom <= menuToday()).at(-1) ?? revisions[0];
  const content = editingRevision?.content ?? current?.content ?? setupContent;
  function done() { setMode('summary'); setReplacement(false); setEditingRevision(null); router.refresh(); }
  async function run(task: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true); setError(null);
    try { const result = await task(); if (result.success) done(); else setError(result.error ?? 'Nie udało się zapisać.'); }
    catch { setError('Nie udało się zapisać. Spróbuj ponownie.'); } finally { setBusy(false); }
  }
  if (mode === 'edit') return <MenuEditor restaurant={restaurant} initialContent={content} initialDate={editingRevision?.effectiveFrom} replaceOfferIds={active === null ? sourceIds : []} onSaved={done} onCancel={done} />;
  if (replacement) return <MenuEditor restaurant={restaurant} initialContent={replacementContent} initialDate={date} onCancel={done} onSaved={done} onSubmit={(dishes, target) => setMenuExceptionAction(restaurant.id, { kind: 'replacement', date: target, dishes })} />;
  return <section className="space-y-4 rounded-md border border-border bg-card p-5">
    <div><h2 className="text-lg font-semibold">{restaurant.name}</h2><p className="text-sm text-muted-foreground">{active === null ? legacyFlag ? 'Menu tygodniowe — potwierdź harmonogram, aby włączyć automatykę' : 'Brak menu cyklicznego' : active ? 'Powtarzanie aktywne' : 'Powtarzanie zatrzymane'}</p></div>
    {generationFailed && <p role="alert" className="text-sm text-destructive">Nie udało się uzupełnić przyszłych ofert. System ponowi próbę; możesz też ponownie zapisać menu.</p>}
    {current && <><p className="text-sm">{[...new Set(current.content.entries.flatMap(d => d.days))].sort().map(d => menuDayLabels[d-1]).join(', ')}</p>
      <ul className="space-y-1 text-sm">{current.content.entries.map(d => <li key={d.id}>{d.dishName} · {d.price.toFixed(2)} PLN</li>)}</ul>
    </>}
    {revisions.filter(r => r.effectiveFrom > menuToday()).map(r => <div key={r.effectiveFrom} className="flex flex-wrap items-center gap-2 text-sm"><span>Zaplanowane nowe menu od {r.effectiveFrom}</span><Button variant="outline" size="sm" disabled={busy} onClick={() => { setEditingRevision(r); setMode('edit'); }}>Edytuj zaplanowane menu</Button></div>)}
    {exceptions.filter(e => e.date >= menuToday()).length > 0 && <div className="space-y-2"><p className="text-sm font-medium">Wyjątki pozostają także po zatrzymaniu i wznowieniu powtarzania:</p>{exceptions.filter(e => e.date >= menuToday()).map(e => <div key={e.date} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{e.date} — {e.kind === 'closed' ? 'Brak lunchu' : 'Inne menu'}</span><Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => setMenuExceptionAction(restaurant.id, { kind: 'remove', date: e.date }))}>Usuń wyjątek</Button></div>)}</div>}
    {mode === 'exception' ? <div className="space-y-3"><label className="block text-sm">Wybierz dzień<Input type="date" min={menuToday()} max={menuDates(menuToday()).at(-1)} value={date} onChange={e => setDate(e.target.value)} /></label><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => run(() => setMenuExceptionAction(restaurant.id, { kind: 'closed', date }))}>Tego dnia nie ma lunchu</Button><Button variant="outline" disabled={busy} onClick={() => { setReplacementContent({ kind: 'fixed', entries: content.entries.map(d => ({ ...d, id: crypto.randomUUID(), days: [1,2,3,4,5] })) }); setReplacement(true); }}>Tego dnia inne menu</Button><Button variant="ghost" disabled={busy} onClick={done}>Anuluj</Button></div></div> : <div className="flex flex-wrap gap-2">
      <Button disabled={busy} onClick={() => setMode('edit')}>{active === null ? 'Włącz automatyczne powtarzanie' : 'Edytuj menu'}</Button>
      {active !== null && <><Button variant="outline" disabled={busy} onClick={() => setMode('exception')}>Pomiń lub zmień dzień</Button><Button variant="outline" disabled={busy} onClick={() => run(() => setMenuActiveAction(restaurant.id, !active))}>{active ? 'Zatrzymaj powtarzanie' : 'Wznów powtarzanie'}</Button></>}
    </div>}
    {active && <p className="text-sm text-muted-foreground">Zatrzymanie wycofa cykliczne oferty od dziś. Jednorazowe menu i historia pozostaną dostępne.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
