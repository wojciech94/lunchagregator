import { z } from 'zod';
import { addDaysISO } from './offer-renewal';
import { allergenSchema, cuisineTypeSchema, dietaryTagSchema, sourceTypeSchema } from './validations/offer';

export const MENU_TIME_ZONE = 'Europe/Warsaw';
export const MENU_HORIZON = 30;
export function menuToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MENU_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export const menuDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(date => {
  const value = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(value.getTime()) && value.toISOString().slice(0, 10) === date;
}, 'Wybierz poprawną datę.');
export const menuDishSchema = z.object({
  id: z.string().uuid(),
  dishName: z.string().trim().min(1, 'Podaj nazwę dania.').max(100),
  price: z.number().min(0.01, 'Podaj cenę wyższą od zera.').max(9999.99, 'Cena może wynosić maksymalnie 9999,99 PLN.'),
  description: z.string().max(500).nullable().default(null),
  items: z.array(z.string().max(200)).max(10).default([]),
  cuisineType: cuisineTypeSchema.nullable().default(null),
  dietaryTags: z.array(dietaryTagSchema).max(5).default([]),
  allergens: z.array(allergenSchema).max(10).default([]),
  sourceType: sourceTypeSchema,
});
export const menuEntrySchema = menuDishSchema.extend({ days: z.array(z.number().int().min(1).max(7)).min(1, 'Wybierz przynajmniej jeden dzień.').max(7).refine(days => new Set(days).size === days.length) });
export const menuContentSchema = z.object({ kind: z.enum(['fixed', 'weekday']), entries: z.array(menuEntrySchema).min(1, 'Dodaj co najmniej jedno danie.').max(100) }).superRefine((content, ctx) => {
  if (new Set(content.entries.map(entry => entry.id)).size !== content.entries.length) ctx.addIssue({ code: 'custom', message: 'Powtórzony identyfikator dania.' });
  if (content.kind === 'fixed' && content.entries.some(entry => [...entry.days].sort().join() !== [...content.entries[0].days].sort().join())) ctx.addIssue({ code: 'custom', message: 'Stałe menu musi obowiązywać w tych samych dniach.' });
});
export const publishMenuSchema = z.object({ restaurantId: z.string().uuid(), effectiveFrom: menuDateSchema, content: menuContentSchema, replaceOfferIds: z.array(z.string().uuid()).max(100).default([]) });
export const menuExceptionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('closed'), date: menuDateSchema }),
  z.object({ kind: z.literal('replacement'), date: menuDateSchema, dishes: z.array(menuDishSchema).min(1).max(100) }),
  z.object({ kind: z.literal('remove'), date: menuDateSchema }),
]);
export type MenuDish = z.infer<typeof menuDishSchema>;
export type MenuContent = z.infer<typeof menuContentSchema>;
export type PublishMenu = z.infer<typeof publishMenuSchema>;
export type MenuException = z.infer<typeof menuExceptionSchema>;
export interface MenuRevision { effectiveFrom: string; content: MenuContent }
export const menuDayLabels = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
export function menuWeekday(date: string): number { return new Date(`${date}T12:00:00Z`).getUTCDay() || 7; }
export function nextMenuMonday(today: string): string { return addDaysISO(today, 8 - menuWeekday(today)); }

/** Shared date-specific menu selection, used by the editable preview and tests.
 * PostgreSQL owns transactional occurrence reconciliation; callers never insert a plan.
 */
export function menuForDate(revisions: MenuRevision[], date: string): MenuDish[] {
  const revision = revisions.filter(value => value.effectiveFrom <= date).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  return revision?.content.entries.filter(entry => entry.days.includes(menuWeekday(date))) ?? [];
}
export function menuDates(from: string, count = MENU_HORIZON): string[] { return Array.from({ length: count }, (_, index) => addDaysISO(from, index)); }
