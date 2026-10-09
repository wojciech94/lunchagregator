import { z } from 'zod';

export const genericSourceSchema = z.object({
  restaurantId: z.string().uuid(), revision: z.string().uuid().nullable(),
  expectedName: z.string().trim().min(1).max(200), expectedAddress: z.string().trim().min(1).max(500),
  action: z.enum(['draft', 'trial', 'confirm', 'disable']),
  url: z.string().url().max(2000).optional(),
  evidence: z.string().trim().min(10).max(1000).optional(),
  confirmed: z.boolean().optional(),
}).strict().superRefine((data, ctx) => {
  if (data.action === 'draft' && !data.url) ctx.addIssue({ code: 'custom', message: 'Podaj URL.' });
  if (data.action === 'confirm' && (!data.evidence || data.confirmed !== true)) ctx.addIssue({ code: 'custom', message: 'Potwierdź dokładny oddział i aktualność menu oraz podaj podstawę weryfikacji.' });
});
