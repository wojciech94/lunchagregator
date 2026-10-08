import { generateObject } from 'ai';
import { recommendationIntentSchema, type RecommendationIntent } from '@/lib/validations/chat';
import { modelWithRateLimitFallback } from '@/lib/ai/model-with-fallback';
import { GEMINI_PROVIDER_OPTIONS } from '@/lib/ai/constants';
import { periodDates, polishWeekday, type DatePeriod, type RecommendationContext } from '@/lib/recommendation-period';
import type { ChatMessage } from './ai-recommender';
import type { Coordinates, LunchOfferWithDistance } from '@/types/offers';
import type { OfferFilters } from '@/types/filters';
import { listOffers } from './offers';

const MAX_OFFERS_PER_DATE = 200;
const MAX_CONTEXT_OFFERS = 1000;
const DATE_QUERY_CONCURRENCY = 4;

export async function identifyRecommendationIntent(messages: ChatMessage[], today: string, signal: AbortSignal, previousPeriod?: DatePeriod): Promise<RecommendationIntent> {
  const result = await generateObject({
    model: modelWithRateLimitFallback(), schema: recommendationIntentSchema,
    maxRetries: 0, providerOptions: GEMINI_PROVIDER_OPTIONS, abortSignal: signal,
    system: `Extract the CURRENT lunch search intent from this conversation. Today in Europe/Warsaw is ${today} (${polishWeekday(today)}).
Read the entire conversation, prioritizing USER requests over assistant statements. Keep the last user-selected period for follow-ups without a new date (e.g. "A coś z mięsem?"). Default to today only if no user ever selected a period. A later explicit period replaces the previous one. Do not inherit a today-only limitation from previous assistant replies.
Previous resolved absolute period: ${previousPeriod ? `${previousPeriod.start} through ${previousPeriod.end}` : 'none'}.
When a previous resolved period exists and the LATEST user message does not request a new date, return period=previous. Never reinterpret an older relative expression (tomorrow, today, this week, next week, weekday) against the current date; its original absolute period is retained even across midnight or a week boundary. Return period=default when no period was selected and there is no prior selection. Use period=today only for an explicit request for today. A new explicit date request in the latest user message replaces the previous selection and is resolved against the current date.
Use today/tomorrow/weekday/this_week/next_week for relative requests, dates for explicit dates or ranges. An unqualified weekday means its next occurrence including today. This week means the remaining days through Sunday; next week means the following Monday–Sunday. For dates with no year, use the current year unless the user explicitly refers to another year. Do not convert a past/unsupported date to today. For yesterday use dates with the actual past date. For unclear or conflicting date requests use clarify and a concise question in the user's language. Do not answer the lunch question yourself.
Extract only explicitly stated current dietary, cuisine and price requirements, carrying them forward unless replaced. A request for meat replaces vegetarian/vegan preferences; there is no meat dietary tag, so use [] and let the recommender examine dishes. Do not guess tags/cuisine or impose a price if unstated. Nullable fields not needed for the selected period must be null.`,
    messages: messages.map(message => ({ role: message.role, content: message.content })),
  });
  return recommendationIntentSchema.parse(result.object);
}

/** At most four pages/day and 1,000 context offers; each date gets a fair share. */
export async function searchRecommendationOffers(
  context: RecommendationContext, intent: RecommendationIntent,
  userLocation: Coordinates | undefined, signal: AbortSignal,
): Promise<{ offers: LunchOfferWithDistance[]; context: RecommendationContext }> {
  const dates = periodDates(context.period);
  const perDay = Math.min(MAX_OFFERS_PER_DATE, Math.floor(MAX_CONTEXT_OFFERS / dates.length));
  const filters: OfferFilters = {
    dietaryTags: intent.dietaryTags.length ? intent.dietaryTags : undefined,
    cuisineTypes: intent.cuisineTypes.length ? intent.cuisineTypes : undefined,
    price: intent.minPrice !== null || intent.maxPrice !== null
      ? { min: intent.minPrice ?? 0, max: intent.maxPrice ?? 9999.99 } : undefined,
  };
  if (filters.price && filters.price.min > filters.price.max) throw new Error('Invalid price range');
  const offers: LunchOfferWithDistance[] = [];
  const incompleteDates: string[] = [];
  // Small batches bound concurrent queries and do not starve later dates.
  for (let index = 0; index < dates.length; index += DATE_QUERY_CONCURRENCY) {
    signal.throwIfAborted();
    const batch = await Promise.all(dates.slice(index, index + DATE_QUERY_CONCURRENCY).map(async date => {
      const rows: LunchOfferWithDistance[] = [];
      let hasMore = false;
      for (let page = 1; rows.length < perDay; page++) {
        signal.throwIfAborted();
        const result = await listOffers({ ...filters, date, page, limit: 50 }, userLocation, signal);
        signal.throwIfAborted();
        const remaining = perDay - rows.length;
        rows.push(...result.offers.slice(0, remaining));
        hasMore = result.hasMore || result.offers.length > remaining;
        if (!result.hasMore || result.offers.length === 0) break;
      }
      return { date, rows, hasMore };
    }));
    for (const result of batch) {
      offers.push(...result.rows);
      if (result.hasMore) incompleteDates.push(result.date);
    }
  }
  return { offers, context: { ...context, incompleteDates } };
}
