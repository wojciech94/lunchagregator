import { z } from 'zod';
import { cuisineTypeSchema, dietaryTagSchema } from './offer';

export const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const distanceFilterSchema = z.object({
  radius: z
    .number()
    .min(0.5, 'Minimum radius is 0.5 km')
    .max(25, 'Maximum radius is 25 km'),
  from: coordinatesSchema,
});

export const priceFilterSchema = z
  .object({
    min: z
      .number()
      .min(0.01, 'Cena musi wynosić co najmniej 0,01 zł.')
      .max(999.99, 'Cena nie może przekraczać 999,99 zł.'),
    max: z
      .number()
      .min(0.01, 'Cena musi wynosić co najmniej 0,01 zł.')
      .max(999.99, 'Cena nie może przekraczać 999,99 zł.'),
  })
  .refine((data) => data.min <= data.max, {
    message: 'Cena minimalna nie może być wyższa od maksymalnej. Zmień zakres cen.',
    path: ['min'],
  });

export const sortBySchema = z.enum([
  'price_asc',
  'price_desc',
  'distance',
  'newest',
]);

export const offerFiltersSchema = z.object({
  distance: distanceFilterSchema.optional(),
  price: priceFilterSchema.optional(),
  cuisineTypes: z.array(cuisineTypeSchema).optional(),
  dietaryTags: z.array(dietaryTagSchema).optional(),
  searchQuery: z
    .string()
    .min(2, 'Search query must be at least 2 characters')
    .optional(),
  sortBy: sortBySchema.optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .refine((value) => {
      const date = new Date(`${value}T12:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, 'Date must be a real calendar date')
    .optional(),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(50).optional().default(50),
});

export type OfferFiltersInput = z.infer<typeof offerFiltersSchema>;
