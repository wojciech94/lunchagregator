import { notFound } from 'next/navigation';

import { getRestaurant } from '@/actions/restaurants';
import { getOffersByRestaurant } from '@/services/offers';
import { getSessionToken } from '@/lib/session';
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

  const [sessionToken, offers] = await Promise.all([
    getSessionToken(),
    getOffersByRestaurant(id),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <RestaurantDetail
        restaurant={restaurant}
        sessionToken={sessionToken ?? ''}
        offers={offers}
      />
    </div>
  );
}
