import { z } from 'zod';

export const cuisineTypeSchema = z.enum([
  'polska',
  'wloska',
  'azjatycka',
  'meksykanska',
  'amerykanska',
  'indyjska',
  'srodziemnomorska',
  'inne',
]);

export const dietaryTagSchema = z.enum([
  'vegetarian',
  'vegan',
  'gluten-free',
  'dairy-free',
  'keto',
]);

export const allergenSchema = z.enum([
  'gluten',
  'orzechy',
  'mleko',
  'jaja',
  'ryby',
  'skorupiaki',
  'soja',
  'seler',
  'gorczyca',
  'sezam',
]);

export const sourceTypeSchema = z.enum(['link', 'text', 'photo']);

/**
 * Returns a Zod schema for available_date validation.
 * Accepts today or up to 30 days in the future.
 */
function availableDateSchema() {
  return z.string().refine(
    (val) => {
      const date = new Date(val + 'T00:00:00');
      if (isNaN(date.getTime())) return false;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const maxDate = new Date(today);
      maxDate.setDate(maxDate.getDate() + 30);

      return date >= today && date <= maxDate;
    },
    {
      message:
        'Available date must be today or within the next 30 days',
    }
  );
}

export const createOfferSchema = z.object({
  dishName: z
    .string()
    .min(1, 'Dish name is required')
    .max(100, 'Dish name must be at most 100 characters'),
  price: z
    .number()
    .min(0.01, 'Price must be at least 0.01')
    .max(9999.99, 'Price must be at most 9999.99'),
  restaurantName: z
    .string()
    .min(1, 'Restaurant name is required')
    .max(100, 'Restaurant name must be at most 100 characters'),
  availableDate: availableDateSchema(),
  sourceType: sourceTypeSchema,

  // Optional fields
  items: z
    .array(z.string().max(200, 'Each item must be at most 200 characters'))
    .max(10, 'Maximum 10 items allowed')
    .optional()
    .default([]),
  description: z
    .string()
    .max(500, 'Description must be at most 500 characters')
    .nullable()
    .optional(),
  cuisineType: cuisineTypeSchema.nullable().optional(),
  dietaryTags: z
    .array(dietaryTagSchema)
    .max(5, 'Maximum 5 dietary tags allowed')
    .optional()
    .default([]),
  allergens: z
    .array(allergenSchema)
    .max(10, 'Maximum 10 allergens allowed')
    .optional()
    .default([]),
  restaurantAddress: z
    .string()
    .max(200, 'Restaurant address must be at most 200 characters')
    .nullable()
    .optional(),
  restaurantId: z.string().uuid('Invalid restaurant ID').optional(),
});

export const updateOfferSchema = z.object({
  dishName: z
    .string()
    .min(1, 'Dish name is required')
    .max(100, 'Dish name must be at most 100 characters')
    .optional(),
  price: z
    .number()
    .min(0.01, 'Price must be at least 0.01')
    .max(9999.99, 'Price must be at most 9999.99')
    .optional(),
  restaurantName: z
    .string()
    .min(1, 'Restaurant name is required')
    .max(100, 'Restaurant name must be at most 100 characters')
    .optional(),
  availableDate: availableDateSchema().optional(),
  sourceType: sourceTypeSchema.optional(),

  // Optional fields
  items: z
    .array(z.string().max(200, 'Each item must be at most 200 characters'))
    .max(10, 'Maximum 10 items allowed')
    .optional(),
  description: z
    .string()
    .max(500, 'Description must be at most 500 characters')
    .nullable()
    .optional(),
  cuisineType: cuisineTypeSchema.nullable().optional(),
  dietaryTags: z
    .array(dietaryTagSchema)
    .max(5, 'Maximum 5 dietary tags allowed')
    .optional(),
  allergens: z
    .array(allergenSchema)
    .max(10, 'Maximum 10 allergens allowed')
    .optional(),
  restaurantAddress: z
    .string()
    .max(200, 'Restaurant address must be at most 200 characters')
    .nullable()
    .optional(),
  // No restaurantId here, deliberately. This schema used to accept
  // `restaurantId: uuid().nullable().optional()`, which promised something the
  // service could not do: mapUpdateToDbRow assigned the column only when the
  // value was `!== undefined`, so passing `null` -- the documented way to detach
  // -- silently wrote nothing while the form reported success.
  //
  // An offer does not detach from a restaurant. Removing the field means a
  // `null` arriving from the client is now rejected by validation instead of
  // silently discarded, which is the outcome #18 asked for. It stays on
  // createOfferSchema, where the RestaurantSelect dropdown really sets it.
});

export type CreateOfferInput = z.infer<typeof createOfferSchema>;
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;
