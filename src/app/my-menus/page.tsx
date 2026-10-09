import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { isAdmin } from '@/lib/ownership';
import { createClient } from '@/lib/supabase/server';
import { menuContentSchema, menuDishSchema, menuToday, type MenuContent } from '@/lib/recurring-menu';
import { addDaysISO } from '@/lib/offer-renewal';
import { MenuManager } from '@/components/menus/MenuManager';

export const metadata = { title: 'Moje menu — Lunch Agregator' };
export default async function MyMenusPage() {
  const user = await getUser();
  if (!user) redirect('/auth/login?redirectTo=/my-menus');
  const client = await createClient();
  let query = client.from('restaurants').select('id,name,address,menu_recurs_weekly').order('name');
  if (!isAdmin(user)) query = query.eq('user_id', user.id);
  const { data: restaurants, error } = await query;
  if (error) return <p role="alert" className="p-6 text-destructive">Nie udało się pobrać restauracji. Spróbuj ponownie.</p>;
  const ids = (restaurants ?? []).map(r => r.id);
  const [schedules, revisions, exceptions, sources, failures] = await Promise.all([
    client.from('menu_schedules').select('*').in('restaurant_id', ids),
    client.from('menu_revisions').select('*').in('restaurant_id', ids).order('effective_from'),
    client.from('menu_exceptions').select('*').in('restaurant_id', ids).gte('date', menuToday()).order('date'),
    client.from('lunch_offers').select('*').in('restaurant_id', ids).is('menu_entry_id', null).eq('withdrawn', false).gte('available_date', addDaysISO(menuToday(), -7)).lte('available_date', addDaysISO(menuToday(), 6)).order('available_date', { ascending: false }).limit(1000),
    client.from('menu_generation_failures').select('restaurant_id').in('restaurant_id', ids),
  ]);
  if ([schedules,revisions,exceptions,sources,failures].some(result => result.error)) return <p role="alert" className="p-6 text-destructive">Nie udało się pobrać menu. Sprawdź konfigurację bazy i spróbuj ponownie.</p>;
  return <div className="mx-auto max-w-3xl space-y-6 px-4 py-6"><div className="space-y-2"><h1 className="text-2xl font-bold">Moje menu</h1><p className="text-muted-foreground">Ustaw raz. Zmieniaj tylko wtedy, gdy zmienia się menu.</p><Link href="/my-offers" className="text-sm text-primary underline underline-offset-4">Oferty jednorazowe i historia</Link></div>
    {ids.length === 0 && <p>Najpierw <Link className="text-primary underline" href="/restaurants/new">dodaj restaurację</Link> lub <Link className="text-primary underline" href="/add">zaimportuj menu</Link>.</p>}
    {(restaurants ?? []).map(restaurant => {
      const rows = (sources.data ?? []).filter(row => row.restaurant_id === restaurant.id);
      const anchor = rows[0]?.available_date;
      const coherent = anchor ? rows.filter(row => row.available_date >= addDaysISO(anchor, -6)) : [];
      const setup: MenuContent = { kind: new Set(coherent.map(r => r.available_date)).size > 1 ? 'weekday' : 'fixed', entries: coherent.map(row => ({ id: row.id, dishName: row.dish_name, price: Number(row.price), description: row.description, items: row.items ?? [], cuisineType: row.cuisine_type, dietaryTags: row.dietary_tags ?? [], allergens: row.allergens ?? [], sourceType: row.source_type, days: [new Date(`${row.available_date}T12:00:00Z`).getUTCDay() || 7] })) };
      if (setup.kind === 'fixed') setup.entries = setup.entries.map(entry => ({ ...entry, days: [1,2,3,4,5] }));
      const savedRevisions = (revisions.data ?? []).filter(r => r.restaurant_id === restaurant.id).map(r => ({ effectiveFrom: r.effective_from, content: menuContentSchema.parse(r.content) }));
      const savedExceptions = (exceptions.data ?? []).filter(e => e.restaurant_id === restaurant.id).map(e => ({ date: e.date, kind: e.kind as 'closed' | 'replacement', dishes: e.dishes ? menuDishSchema.array().parse(e.dishes) : null }));
      return <MenuManager key={restaurant.id} restaurant={restaurant} legacyFlag={restaurant.menu_recurs_weekly} active={(schedules.data ?? []).find(s => s.restaurant_id === restaurant.id)?.active ?? null} revisions={savedRevisions} exceptions={savedExceptions} setupContent={setup} sourceIds={coherent.map(r => r.id)} generationFailed={(failures.data ?? []).some(f => f.restaurant_id === restaurant.id)} />;
    })}
  </div>;
}
