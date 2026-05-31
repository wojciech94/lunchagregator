import { Coordinates, CuisineType } from './offers';

export type PriceLevel = 'budżetowa' | 'średnia' | 'premium';

export interface LunchHours {
  start: string; // HH:MM format, 06:00-18:00
  end: string;   // HH:MM format, 07:00-23:00
}

export interface Restaurant {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  location: Coordinates | null;
  priceLevel: PriceLevel | null;
  lunchHours: LunchHours | null;
  cuisineTypes: CuisineType[];
  phoneNumber: string | null;
  websiteUrl: string | null;
  sessionToken: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RestaurantWithDistance extends Restaurant {
  distanceKm: number | null;
  activeOffersCount: number;
}

export interface RestaurantSummary {
  id: string;
  name: string;
  address: string | null;
  cuisineTypes: CuisineType[];
}

export interface CreateRestaurantInput {
  name: string;
  description?: string;
  address?: string;
  location?: Coordinates;
  priceLevel?: PriceLevel;
  lunchHours?: LunchHours;
  cuisineTypes?: CuisineType[];
  phoneNumber?: string;
  websiteUrl?: string;
}

export interface UpdateRestaurantInput {
  name?: string;
  description?: string | null;
  address?: string | null;
  location?: Coordinates | null;
  priceLevel?: PriceLevel | null;
  lunchHours?: LunchHours | null;
  cuisineTypes?: CuisineType[];
  phoneNumber?: string | null;
  websiteUrl?: string | null;
}

export interface RestaurantFilters {
  distance?: { radius: number; from: Coordinates };
  priceLevels?: PriceLevel[];
  cuisineTypes?: CuisineType[];
  lunchTimeAt?: string;
  searchQuery?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedRestaurants {
  restaurants: RestaurantWithDistance[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
