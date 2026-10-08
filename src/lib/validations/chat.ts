import { z } from 'zod';

export const recommendationDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});

const datePeriodSchema = z.object({ start: recommendationDateSchema, end: recommendationDateSchema })
  .refine(period => period.start <= period.end);

export const recommendationPeriodAnnotationSchema = z.object({
  type: z.literal('recommendation-period'),
  // Null means the dynamic default (today), rather than an explicit selection.
  period: datePeriodSchema.nullable(),
});

export const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(10000),
    annotations: z.array(recommendationPeriodAnnotationSchema).max(10).optional(),
  })).min(1).max(50),
  userLocation: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }).optional(),
});

// Relative periods are calculated by the server, not by the model.
export const recommendationIntentSchema = z.object({
  period: z.enum(['default', 'previous', 'today', 'tomorrow', 'weekday', 'this_week', 'next_week', 'dates', 'clarify']),
  weekday: z.number().int().min(0).max(6).nullable().describe('Sunday=0, Monday=1, ..., Saturday=6; only for weekday'),
  startDate: z.string().nullable().describe('YYYY-MM-DD; only for explicit dates'),
  endDate: z.string().nullable().describe('YYYY-MM-DD; equal to startDate for one explicit date'),
  clarification: z.string().max(500).nullable(),
  dietaryTags: z.array(z.enum(['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'keto'])).max(5),
  cuisineTypes: z.array(z.enum(['polska', 'wloska', 'azjatycka', 'meksykanska', 'amerykanska', 'indyjska', 'srodziemnomorska', 'inne'])).max(8),
  minPrice: z.number().min(0).max(9999.99).nullable(),
  maxPrice: z.number().min(0).max(9999.99).nullable(),
});

export type RecommendationIntent = z.infer<typeof recommendationIntentSchema>;
