import { z } from 'zod';

export const lunchImportRequestSchema = z.object({
  sourceId: z.enum(['sofa', 'sushi']),
}).strict();
