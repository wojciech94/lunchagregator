import type { Coordinates, CuisineType, DietaryTag } from './offers';

export interface OfferFilters {
  distance?: { radius: number; from: Coordinates }; // 0.5-25 km
  price?: { min: number; max: number }; // 0.01-999.99
  cuisineTypes?: CuisineType[];
  dietaryTags?: DietaryTag[];
  searchQuery?: string; // min 2 characters
  sortBy?: 'price_asc' | 'price_desc' | 'distance' | 'newest';
  date?: string; // YYYY-MM-DD — which day's offers to show (defaults to today)
  page?: number;
  limit?: number; // max 50
}
