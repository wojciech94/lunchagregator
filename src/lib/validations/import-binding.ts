import { z } from 'zod';
import { lunchImportRequestSchema } from './lunch-import';

const common = {
  restaurantId: z.string().uuid(), sourceId: lunchImportRequestSchema.shape.sourceId,
  revision: z.string().uuid().nullable(),
  expectedName: z.string().min(1).max(200), expectedAddress: z.string().min(1).max(500),
};
export const configureImportBindingSchema = z.discriminatedUnion('action', [
  z.object({ ...common, action: z.literal('confirm'), confirmed: z.literal(true),
    evidence: z.string().trim().min(10, 'Opisz, jak potwierdzono właściwy oddział (minimum 10 znaków).').max(1000) }).strict(),
  z.object({ ...common, action: z.literal('disable') }).strict(),
]);
