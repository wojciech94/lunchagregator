import { notFound } from 'next/navigation';

import { getRestaurant } from '@/actions/restaurants';
import { getOffersByRestaurant } from '@/services/offers';
import { capabilitiesFor } from '@/lib/permissions';
import { RestaurantDetail } from '@/components/restaurants/RestaurantDetail';

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

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <RestaurantDetail
        restaurant={restaurant}
        canEdit={capabilities.canEdit}
        canDelete={capabilities.canDelete}
        offers={offers}
      />
    </div>
  );
}
