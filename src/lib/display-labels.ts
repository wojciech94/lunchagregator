import type { Allergen, CuisineType, DietaryTag } from '@/types/offers';

export const cuisineLabels: Record<CuisineType, string> = {
  polska: 'Polska', wloska: 'Włoska', azjatycka: 'Azjatycka', meksykanska: 'Meksykańska',
  amerykanska: 'Amerykańska', indyjska: 'Indyjska', srodziemnomorska: 'Śródziemnomorska', inne: 'Inne',
};
export const dietaryLabels: Record<DietaryTag, string> = {
  vegetarian: 'Wegetariańskie', vegan: 'Wegańskie', 'gluten-free': 'Bezglutenowe', 'dairy-free': 'Bez nabiału', keto: 'Keto',
};
export const allergenLabels: Record<Allergen, string> = {
  gluten: 'Gluten', orzechy: 'Orzechy', mleko: 'Mleko', jaja: 'Jaja', ryby: 'Ryby',
  skorupiaki: 'Skorupiaki', soja: 'Soja', seler: 'Seler', gorczyca: 'Gorczyca', sezam: 'Sezam',
};
