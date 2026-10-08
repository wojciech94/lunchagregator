import { z } from 'zod';
import { createOfferSchema } from './offer';
import { importAvailableDateSchema } from './import-date';

export const lunchImportRequestSchema = z.object({
  sourceId: z.enum(['sofa', 'sushi']),
}).strict();

export const importPublicationSchema = z.object({
  sourceId: lunchImportRequestSchema.shape.sourceId,
  restaurantId: z.string().uuid(),
  // Shared with the browser: freshness requires the server's authoritative clock.
  fetchedAt: z.string().datetime(),
  availableDate: importAvailableDateSchema,
  confirmed: z.literal(true),
  dishes: z.array(createOfferSchema.pick({ dishName: true, price: true, description: true, items: true })
    .extend({ dishName: createOfferSchema.shape.dishName.trim().min(1, 'Podaj nazwę dania.'),
      price: createOfferSchema.shape.price.refine(price => Math.abs(price * 100 - Math.round(price * 100)) < 0.000001,
        'Podaj cenę w PLN z maksymalnie dwoma miejscami po przecinku.'),
      itemKey: z.string().regex(/^[a-f0-9]{64}$/) }).strict())
    .min(1, 'Wybierz co najmniej jedną pozycję.').max(50),
}).strict();
