import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const cuisineTypeValues = [
  'polska',
  'wloska',
  'azjatycka',
  'meksykanska',
  'amerykanska',
  'indyjska',
  'srodziemnomorska',
  'inne',
] as const;

export const priceLevelValues = ['budżetowa', 'średnia', 'premium'] as const;

export const lunchHoursSchema = z
  .object({
    start: z
      .string()
      .regex(timeRegex, 'Format HH:MM wymagany')
      .refine(
        (val) => {
          const [h] = val.split(':').map(Number);
          return h >= 6 && h <= 18;
        },
        'Godzina rozpoczęcia musi być między 06:00 a 18:00'
      ),
    end: z
      .string()
      .regex(timeRegex, 'Format HH:MM wymagany')
      .refine(
        (val) => {
          const [h] = val.split(':').map(Number);
          return h >= 7 && h <= 23;
        },
        'Godzina zakończenia musi być między 07:00 a 23:00'
      ),
  })
  .refine(
    (data) => data.start < data.end,
    'Godzina rozpoczęcia musi być wcześniejsza niż godzina zakończenia'
  );

export const createRestaurantSchema = z
  .object({
    name: z
      .string()
      .min(2, 'Nazwa musi mieć co najmniej 2 znaki')
      .max(100, 'Nazwa może mieć maksymalnie 100 znaków'),
    description: z
      .string()
      .max(500, 'Opis może mieć maksymalnie 500 znaków')
      .optional(),
    address: z
      .string()
      .max(200, 'Adres może mieć maksymalnie 200 znaków')
      .optional(),
    location: z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      })
      .optional(),
    priceLevel: z.enum(priceLevelValues).optional(),
    lunchHours: lunchHoursSchema.optional(),
    cuisineTypes: z.array(z.enum(cuisineTypeValues)).optional(),
    phoneNumber: z
      .string()
      .max(20, 'Numer telefonu może mieć maksymalnie 20 znaków')
      .optional(),
    websiteUrl: z
      .string()
      .max(500, 'URL może mieć maksymalnie 500 znaków')
      .url('Nieprawidłowy format URL')
      .optional(),
  })
  .refine(
    (data) => data.address !== undefined || data.location !== undefined,
    'Wymagany jest adres lub współrzędne geograficzne'
  );

export const updateRestaurantSchema = z.object({
  name: z
    .string()
    .min(2, 'Nazwa musi mieć co najmniej 2 znaki')
    .max(100, 'Nazwa może mieć maksymalnie 100 znaków')
    .optional(),
  description: z
    .string()
    .max(500, 'Opis może mieć maksymalnie 500 znaków')
    .nullable()
    .optional(),
  address: z
    .string()
    .max(200, 'Adres może mieć maksymalnie 200 znaków')
    .nullable()
    .optional(),
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .nullable()
    .optional(),
  priceLevel: z.enum(priceLevelValues).nullable().optional(),
  lunchHours: lunchHoursSchema.nullable().optional(),
  cuisineTypes: z.array(z.enum(cuisineTypeValues)).optional(),
  phoneNumber: z
    .string()
    .max(20, 'Numer telefonu może mieć maksymalnie 20 znaków')
    .nullable()
    .optional(),
  websiteUrl: z
    .string()
    .max(500, 'URL może mieć maksymalnie 500 znaków')
    .url('Nieprawidłowy format URL')
    .nullable()
    .optional(),
});

export type CreateRestaurantSchemaInput = z.infer<typeof createRestaurantSchema>;
export type UpdateRestaurantSchemaInput = z.infer<typeof updateRestaurantSchema>;
export type LunchHoursSchemaInput = z.infer<typeof lunchHoursSchema>;
