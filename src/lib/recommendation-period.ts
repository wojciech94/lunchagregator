import { recommendationDateSchema, recommendationPeriodAnnotationSchema, type RecommendationIntent } from './validations/chat';

export interface DatePeriod { start: string; end: string }
export interface RecommendationContext {
  today: string;
  requestedPeriod: DatePeriod;
  period: DatePeriod;
  clipped: boolean;
  incompleteDates: string[];
}

export function warsawToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/** Arithmetic on calendar dates, unaffected by host timezone or DST. */
export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Read only assistant metadata; user annotations cannot set the prior selection. */
export function previousRecommendationPeriod(messages: { role: string; annotations?: unknown[] }[]): DatePeriod | undefined {
  for (const message of [...messages].reverse()) {
    if (message.role !== 'assistant') continue;
    for (const annotation of [...(message.annotations ?? [])].reverse()) {
      const parsed = recommendationPeriodAnnotationSchema.safeParse(annotation);
      if (parsed.success) return parsed.data.period ?? undefined;
    }
  }
}

export type PeriodResolution = { context: RecommendationContext; message?: never } | { message: string; context?: never };

export function resolveRecommendationPeriod(intent: RecommendationIntent, today: string, previousPeriod?: DatePeriod): PeriodResolution {
  const day = new Date(`${today}T12:00:00Z`).getUTCDay();
  let start = today;
  let end = today;
  switch (intent.period) {
    case 'previous':
      if (!previousPeriod) return { message: 'Nie mam zapisanego poprzedniego okresu. Na jaki dzień lub zakres dat szukasz lunchu?' };
      start = previousPeriod.start;
      end = previousPeriod.end;
      break;
    case 'clarify': return { message: intent.clarification || 'Na jaki dzień lub zakres dat szukasz lunchu?' };
    case 'tomorrow': start = end = shiftDate(today, 1); break;
    case 'weekday':
      if (intent.weekday === null) return { message: 'O który dzień tygodnia chodzi?' };
      start = end = shiftDate(today, (intent.weekday - day + 7) % 7); break;
    case 'this_week': end = shiftDate(today, (7 - day) % 7); break;
    case 'next_week':
      start = shiftDate(today, 7 - ((day + 6) % 7));
      end = shiftDate(start, 6); break;
    case 'dates':
      if (!recommendationDateSchema.safeParse(intent.startDate).success || !recommendationDateSchema.safeParse(intent.endDate).success) {
        return { message: 'Podaj poprawną datę lub zakres dat (np. 2026-10-12).' };
      }
      start = intent.startDate!;
      end = intent.endDate!;
      if (start > end) return { message: 'Data końcowa musi być równa dacie początkowej lub późniejsza. Jaki okres sprawdzić?' };
      break;
  }
  const max = shiftDate(today, 30);
  if (end < today || start > max) {
    return { message: `Mogę sprawdzić opublikowane oferty od ${today} do ${max}. Wskazany okres (${start} – ${end}) jest poza tym zakresem.` };
  }
  const period = { start: start < today ? today : start, end: end > max ? max : end };
  return { context: {
    today, requestedPeriod: { start, end }, period,
    clipped: start !== period.start || end !== period.end, incompleteDates: [],
  } };
}

export function periodDates(period: DatePeriod): string[] {
  const dates: string[] = [];
  for (let date = period.start; date <= period.end; date = shiftDate(date, 1)) dates.push(date);
  return dates;
}

export function polishWeekday(date: string): string {
  return new Intl.DateTimeFormat('pl-PL', { weekday: 'long', timeZone: 'Europe/Warsaw' })
    .format(new Date(`${date}T12:00:00Z`));
}
