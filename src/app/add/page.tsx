import { z } from "zod";
import { getRestaurant } from "@/actions/restaurants";
import AddOfferWizard from "@/components/add-offer/AddOfferWizard";
import type { AssignedRestaurant } from "@/lib/restaurant-match";

interface AddOfferPageProps {
  searchParams: Promise<{ restaurantId?: string | string[] }>;
}

export default async function AddOfferPage({
  searchParams,
}: AddOfferPageProps) {
  const { restaurantId } = await searchParams;
  let initialRestaurant: AssignedRestaurant | null = null;
  let restaurantError: string | null = null;
  if (restaurantId !== undefined) {
    const parsed = z.string().uuid().safeParse(restaurantId);
    if (!parsed.success) {
      restaurantError =
        "Nieprawidłowy link do restauracji. Wybierz restaurację ponownie przy dodawaniu oferty.";
    } else {
      try {
        const restaurant = await getRestaurant(parsed.data);
        if (restaurant) {
          initialRestaurant = {
            id: restaurant.id,
            name: restaurant.name,
            address: restaurant.address,
          };
        } else {
          restaurantError =
            "Nie znaleziono wskazanej restauracji. Wybierz inną przy dodawaniu oferty.";
        }
      } catch {
        restaurantError =
          "Nie udało się odczytać restauracji. Wybierz ją ponownie przy dodawaniu oferty.";
      }
    }
  }
  return (
    <AddOfferWizard
      initialRestaurant={initialRestaurant}
      restaurantError={restaurantError}
    />
  );
}
