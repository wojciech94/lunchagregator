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
        'Wybierz datę od dziś do 30 dni w przyszłość.',
    }
  );
}

export const createOfferSchema = z.object({
  dishName: z
    .string()
    .min(1, 'Podaj nazwę dania.')
    .max(100, 'Nazwa dania może mieć maksymalnie 100 znaków.'),
  price: z
    .number({ required_error: 'Podaj cenę w PLN.', invalid_type_error: 'Podaj cenę w PLN.' })
    .min(0.01, 'Cena musi wynosić co najmniej 0,01 PLN.')
    .max(9999.99, 'Cena może wynosić maksymalnie 9999,99 PLN.'),
  restaurantName: z
    .string()
    .min(1, 'Podaj nazwę restauracji.')
    .max(100, 'Nazwa restauracji może mieć maksymalnie 100 znaków.'),
  availableDate: availableDateSchema(),
  sourceType: sourceTypeSchema,

  // Optional fields
  items: z
    .array(z.string().max(200, 'Pozycja zestawu może mieć maksymalnie 200 znaków.'))
    .max(10, 'Zestaw może zawierać maksymalnie 10 pozycji.')
    .optional()
    .default([]),
  description: z
    .string()
    .max(500, 'Opis może mieć maksymalnie 500 znaków.')
    .nullable()
    .optional(),
  cuisineType: cuisineTypeSchema.nullable().optional(),
  dietaryTags: z
    .array(dietaryTagSchema)
    .max(5, 'Wybierz maksymalnie 5 tagów dietetycznych.')
    .optional()
    .default([]),
  allergens: z
    .array(allergenSchema)
    .max(10, 'Wybierz maksymalnie 10 alergenów.')
    .optional()
    .default([]),
  restaurantAddress: z
    .string()
    .max(200, 'Adres restauracji może mieć maksymalnie 200 znaków.')
    .nullable()
    .optional(),
  restaurantId: z.string().uuid('Nieprawidłowy identyfikator restauracji.').optional(),
});

export const updateOfferSchema = z.object({
  dishName: z
    .string()
    .min(1, 'Podaj nazwę dania.')
    .max(100, 'Nazwa dania może mieć maksymalnie 100 znaków.')
    .optional(),
  price: z
    .number({ required_error: 'Podaj cenę w PLN.', invalid_type_error: 'Podaj cenę w PLN.' })
    .min(0.01, 'Cena musi wynosić co najmniej 0,01 PLN.')
    .max(9999.99, 'Cena może wynosić maksymalnie 9999,99 PLN.')
    .optional(),
  restaurantName: z
    .string()
    .min(1, 'Podaj nazwę restauracji.')
    .max(100, 'Nazwa restauracji może mieć maksymalnie 100 znaków.')
    .optional(),
  availableDate: availableDateSchema().optional(),
  sourceType: sourceTypeSchema.optional(),

  // Optional fields
  items: z
    .array(z.string().max(200, 'Pozycja zestawu może mieć maksymalnie 200 znaków.'))
    .max(10, 'Zestaw może zawierać maksymalnie 10 pozycji.')
    .optional(),
  description: z
    .string()
    .max(500, 'Opis może mieć maksymalnie 500 znaków.')
    .nullable()
    .optional(),
  cuisineType: cuisineTypeSchema.nullable().optional(),
  dietaryTags: z
    .array(dietaryTagSchema)
    .max(5, 'Wybierz maksymalnie 5 tagów dietetycznych.')
    .optional(),
  allergens: z
    .array(allergenSchema)
    .max(10, 'Wybierz maksymalnie 10 alergenów.')
    .optional(),
  restaurantAddress: z
    .string()
    .max(200, 'Adres restauracji może mieć maksymalnie 200 znaków.')
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
