export type CuisineType =
  | 'polska'
  | 'wloska'
  | 'azjatycka'
  | 'meksykanska'
  | 'amerykanska'
  | 'indyjska'
  | 'srodziemnomorska'
  | 'inne';

export type DietaryTag =
  | 'vegetarian'
  | 'vegan'
  | 'gluten-free'
  | 'dairy-free'
  | 'keto';

export type Allergen =
  | 'gluten'
  | 'orzechy'
  | 'mleko'
  | 'jaja'
  | 'ryby'
  | 'skorupiaki'
  | 'soja'
  | 'seler'
  | 'gorczyca'
  | 'sezam';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface LunchOffer {
  id: string;
  dishName: string;
  items: string[];
  price: number;
  currency: string;
  description: string | null;
  restaurantId?: string;
  restaurantName: string;
  restaurantAddress: string | null;
  restaurantLocation: Coordinates | null;
  availableDate: string; // ISO date (YYYY-MM-DD)
  cuisineType: CuisineType | null;
  dietaryTags: DietaryTag[];
  allergens: Allergen[];
  sourceType: 'link' | 'text' | 'photo';
  sessionToken: string;
  createdAt: string;
  updatedAt: string;
}

export interface LunchOfferWithDistance extends LunchOffer {
  distanceKm: number | null;
}

export interface PaginatedOffers {
  offers: LunchOfferWithDistance[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
