import { notFound } from 'next/navigation';

import { getRestaurant } from '@/actions/restaurants';
import { getOffersByRestaurant } from '@/services/offers';
import { capabilitiesFor } from '@/lib/permissions';
import { RestaurantDetail } from '@/components/restaurants/RestaurantDetail';
import { getAdmin } from '@/lib/auth';
import { listImportBindings } from '@/lib/lunch-import/bindings';
import { RestaurantImportSettings } from '@/components/admin/RestaurantImportSettings';

interface RestaurantDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function RestaurantDetailPage({ params }: RestaurantDetailPageProps) {
  const { id } = await params;
  const restaurant = await getRestaurant(id);

  if (!restaurant) {
    notFound();
  }

  // Capabilities are resolved once, here, from the server's own view of the
  // caller. The component renders them; it does not derive them.
  const [capabilities, offers] = await Promise.all([
    capabilitiesFor(restaurant.userId ?? null),
    getOffersByRestaurant(id),
  ]);
  const admin = await getAdmin();
  let bindings;
  let importError = false;
  if (admin && restaurant.address) {
    try { bindings = await listImportBindings(); } catch { importError = true; }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
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
