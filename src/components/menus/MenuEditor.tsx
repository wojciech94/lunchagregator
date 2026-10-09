'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OfferForm } from '@/components/add-offer/OfferForm';
import { publishMenuAction } from '@/actions/menus';
import { menuContentSchema, menuDates, menuDayLabels, menuForDate, menuToday, nextMenuMonday, type MenuContent, type MenuDish } from '@/lib/recurring-menu';
import type { AssignedRestaurant } from '@/lib/restaurant-match';
import type { PrefilledOffer, PrefilledDish } from '@/lib/validations/extraction';

const extractedDays = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
export function contentFromExtraction(dishes: PrefilledDish[], sourceType: MenuDish['sourceType']): MenuContent {
  const weekday = dishes.some(dish => dish.dayOfWeek);
  return { kind: weekday ? 'weekday' : 'fixed', entries: dishes.map(dish => ({
    id: crypto.randomUUID(), dishName: dish.name ?? '', price: dish.price ?? 0, description: dish.description,
    items: dish.items, dietaryTags: dish.dietaryTags, allergens: dish.allergens, cuisineType: null, sourceType,
    days: weekday && dish.dayOfWeek ? [extractedDays.indexOf(dish.dayOfWeek) + 1] : [1,2,3,4,5],
  })) };
}
export function MenuEditor({ restaurant, initialContent, replaceOfferIds = [], onSaved, onCancel, onSubmit, initialDate }: {
  restaurant: AssignedRestaurant; initialContent: MenuContent; replaceOfferIds?: string[];
  onSaved: () => void; onCancel?: () => void; initialDate?: string;
  onSubmit?: (dishes: MenuDish[], date: string) => Promise<{ success: boolean; error?: string }>;
}) {
  const [content, setContent] = useState(initialContent);
  const [date, setDate] = useState(initialDate ?? menuToday());
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewDate, setPreviewDate] = useState(nextMenuMonday(menuToday()));
  const fixedDays = content.entries[0]?.days ?? [1,2,3,4,5];
  const entry = content.entries.find(d => d.id === editing);
  const prefilled: PrefilledOffer = { restaurantName: restaurant.name, address: restaurant.address ?? '', missingFields: [], dishes: entry ? [{
    name: entry.dishName, price: entry.price || null, description: entry.description ?? '', items: entry.items, dietaryTags: entry.dietaryTags,
    allergens: entry.allergens, dayOfWeek: null, missingFields: [],
  }] : [] };
  function setDays(id: string | null, day: number, selected: boolean) {
    setContent(previous => ({ ...previous, entries: previous.entries.map(dish => {
      if (id && id !== dish.id) return dish;
      return { ...dish, days: (selected ? [...dish.days, day] : dish.days.filter(d => d !== day)).sort() };
    }) }));
  }
  function addDish() {
    const dish = { id: crypto.randomUUID(), dishName: '', price: 0, description: null, items: [], dietaryTags: [], allergens: [], cuisineType: null, sourceType: 'text' as const, days: content.kind === 'fixed' ? fixedDays : [1] };
    setContent(previous => ({ ...previous, entries: [...previous.entries, dish] })); setEditing(dish.id);
  }
  async function save() {
    const parsed = menuContentSchema.safeParse(content);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setSaving(true); setError(null);
    try {
      const result = onSubmit ? await onSubmit(parsed.data.entries, date) : await publishMenuAction({ restaurantId: restaurant.id, content: parsed.data, effectiveFrom: date, replaceOfferIds });
      if (!result.success) setError(result.error ?? 'Nie udało się zapisać menu.'); else onSaved();
    } catch { setError('Nie udało się zapisać menu. Spróbuj ponownie.'); } finally { setSaving(false); }
  }
  const weekdays = (id: string | null, selected: number[]) => <div className="flex flex-wrap gap-2">
    {menuDayLabels.map((label, index) => <label key={label} className="flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm">
      <input type="checkbox" checked={selected.includes(index+1)} disabled={saving || Boolean(editing)} onChange={e => setDays(id, index+1, e.target.checked)} aria-label={`${label}${id ? ` — ${content.entries.find(d => d.id === id)?.dishName || 'nowe danie'}` : ''}`} />{label.slice(0,3)}.
    </label>)}
  </div>;
  return <section className="space-y-5 rounded-md border border-border bg-card p-5" aria-label={onSubmit ? 'Menu na wybraną datę' : 'Publikacja menu cyklicznego'}>
    <div><h2 className="text-lg font-semibold">{onSubmit ? 'Inne menu na ten dzień' : 'Powtarzaj automatycznie'}</h2><p className="text-sm text-muted-foreground">{restaurant.name}</p></div>
    <fieldset disabled={saving} className="space-y-5">
      {!onSubmit && <><label className="block text-sm">Jak obowiązuje menu?
        <select className="mt-2 w-full rounded-md border border-border bg-background p-3" value={content.kind} disabled={Boolean(editing)} onChange={e => setContent(previous => ({ kind: e.target.value === 'fixed' ? 'fixed' : 'weekday', entries: previous.entries.map(d => ({ ...d, days: e.target.value === 'fixed' ? fixedDays : d.days })) }))}>
          <option value="fixed">To samo menu w wybrane dni</option><option value="weekday">Inne menu na każdy dzień tygodnia</option>
        </select>
      </label>{content.kind === 'fixed' && <div className="space-y-2"><p className="text-sm">Dni z lunchem</p>{weekdays(null, fixedDays)}</div>}</>}
      <label className="block text-sm">{onSubmit ? 'Data wyjątku' : 'Obowiązuje od'}<Input type="date" value={date} min={menuToday()} max={menuDates(menuToday()).at(-1)} onChange={e => setDate(e.target.value)} className="mt-2" /></label>
      {!onSubmit && <p className="text-sm text-muted-foreground">Co tydzień, do odwołania. Zmiany obejmą wybraną datę i kolejne dni.</p>}
      <ul className="space-y-4">{content.entries.map(dish => <li key={dish.id} className="space-y-2 border-b border-border pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><span>{dish.dishName || 'Nowe danie'} · {dish.price > 0 ? `${dish.price.toFixed(2)} PLN` : 'Uzupełnij cenę'}</span>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={Boolean(editing)} onClick={() => setEditing(dish.id)}>Edytuj danie</Button><Button size="sm" variant="ghost" disabled={Boolean(editing)} onClick={() => setContent(previous => ({ ...previous, entries: previous.entries.filter(d => d.id !== dish.id) }))}>Usuń danie</Button></div>
        </div>
        {content.kind === 'weekday' && !onSubmit && <><span className="text-sm text-muted-foreground">Dni dla tego dania — zaznacz kolejny dzień, aby skopiować</span>{weekdays(dish.id, dish.days)}</>}
      </li>)}</ul>
      {!editing && <Button variant="outline" onClick={addDish}>Dodaj danie</Button>}
    </fieldset>
    {entry && <div className="space-y-3 border-t border-border pt-4"><OfferForm key={entry.id} prefilledData={prefilled} sourceType={entry.sourceType} initialCuisine={entry.cuisineType} assignedRestaurant={restaurant} menuDishMode isSubmitting={saving} onSubmit={value => {
      setContent(previous => ({ ...previous, entries: previous.entries.map(d => d.id === entry.id ? { ...d, dishName: value.dishName, price: value.price, description: value.description ?? null, cuisineType: value.cuisineType ?? null, items: value.items, dietaryTags: value.dietaryTags, allergens: value.allergens } : d) })); setEditing(null);
    }} /><Button variant="ghost" onClick={() => setEditing(null)}>Wróć do menu</Button></div>}
    {!onSubmit && <div className="space-y-2 border-t border-border pt-4"><label className="block text-sm">Podgląd dnia<Input type="date" value={previewDate} min={menuToday()} max={menuDates(menuToday()).at(-1)} onChange={e => setPreviewDate(e.target.value)} className="mt-2" /></label>
      <div aria-live="polite"><p className="font-medium">{previewDate}</p>{menuForDate([{ effectiveFrom: date, content }], previewDate).map(d => <p key={d.id} className="text-sm">{d.dishName || 'Nowe danie'} · {d.price.toFixed(2)} PLN</p>)}{menuForDate([{ effectiveFrom: date, content }], previewDate).length === 0 && <p className="text-sm text-muted-foreground">Brak lunchu w tym dniu.</p>}</div>
    </div>}
    {replaceOfferIds.length > 0 && <p className="text-sm text-muted-foreground">Wybrane oferty źródłowe na przyszłe daty zostaną zastąpione tym menu. Historia pozostanie dostępna.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2"><Button disabled={saving || Boolean(editing)} onClick={save}>{saving ? 'Publikowanie...' : 'Opublikuj menu'}</Button>{onCancel && <Button variant="ghost" disabled={saving} onClick={onCancel}>Anuluj</Button>}</div>
  </section>;
}
