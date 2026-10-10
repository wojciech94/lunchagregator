import { notFound } from 'next/navigation';

import { getRestaurant } from '@/actions/restaurants';
import { getOffersByRestaurant } from '@/services/offers';
import { capabilitiesFor } from '@/lib/permissions';
import { RestaurantDetail } from '@/components/restaurants/RestaurantDetail';
import { getAdmin } from '@/lib/auth';
import { listImportBindings } from '@/lib/lunch-import/bindings';
import { RestaurantImportSettings } from '@/components/admin/RestaurantImportSettings';
import { createClient } from '@/lib/supabase/server';
import { menuDateSchema, menuDates, menuToday } from '@/lib/recurring-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface RestaurantDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}

export default async function RestaurantDetailPage({ params, searchParams }: RestaurantDetailPageProps) {
  const { id } = await params;
  const requested = await searchParams;
  const date = menuDateSchema.safeParse(requested.date).success ? requested.date! : menuToday();
  const restaurant = await getRestaurant(id);

  if (!restaurant) {
    notFound();
  }

  // Capabilities are resolved once, here, from the server's own view of the
  // caller. The component renders them; it does not derive them.
  const [capabilities, offers] = await Promise.all([
    capabilitiesFor(restaurant.userId ?? null),
    getOffersByRestaurant(id, date),
  ]);
  const client = await createClient();
  const [exception, schedule] = await Promise.all([
    client.from('menu_exceptions').select('kind').eq('restaurant_id', id).eq('date', date).maybeSingle(),
    client.from('menu_schedules').select('active,updated_at').eq('restaurant_id', id).maybeSingle(),
  ]);
  const admin = await getAdmin();
  let bindings;
  let importError = false;
  if (admin && restaurant.address) {
    try { bindings = await listImportBindings(); } catch { importError = true; }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-4 space-y-3">
        <form className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-2 text-sm">
            Menu na dzień
            <Input type="date" name="date" defaultValue={date} min={menuToday()} max={menuDates(menuToday()).at(-1)} />
          </label>
          <Button type="submit" variant="outline" size="sm">Pokaż menu</Button>
        </form>
        {schedule.data?.active && <p className="text-sm text-muted-foreground">Menu cykliczne · Zaktualizowano {schedule.data.updated_at.slice(0,10)}</p>}
        {exception.data?.kind === 'closed' && <p>Tego dnia nie ma lunchu.</p>}
        {(exception.error || schedule.error) && <p role="alert" className="text-destructive">Nie udało się pobrać informacji o menu.</p>}
      </div>
      <RestaurantDetail
        restaurant={restaurant}
        canEdit={capabilities.canEdit}
        canDelete={capabilities.canDelete}
        offers={offers}
      />
      {admin && restaurant.address && bindings && <RestaurantImportSettings
        restaurant={{ id, name: restaurant.name, address: restaurant.address }} bindings={bindings} />}
      {admin && !restaurant.address && <p className="mt-8">Przed konfiguracją importu uzupełnij adres oddziału.</p>}
      {importError && <p role="alert" className="mt-8">Konfiguracja importu jest niedostępna. Sprawdź migrację bazy.</p>}
    </div>
  );
}
