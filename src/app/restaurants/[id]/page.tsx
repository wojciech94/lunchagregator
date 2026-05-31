import { notFound } from 'next/navigation';

import { getRestaurant } from '@/actions/restaurants';
import { getOffersByRestaurant } from '@/services/offers';
import { getUser } from '@/lib/auth';
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

  const [user, offers] = await Promise.all([
    getUser(),
    getOffersByRestaurant(id),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <RestaurantDetail
        restaurant={restaurant}
        currentUserId={user?.id ?? null}
        offers={offers}
      />
    </div>
  );
}
