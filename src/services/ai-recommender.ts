import { streamText, type CoreMessage } from 'ai';
import { modelWithRateLimitFallback } from '@/lib/ai/model-with-fallback';
import { AI_TIMEOUT_MS, GEMINI_PROVIDER_OPTIONS } from '@/lib/ai/constants';
import type { Coordinates, LunchOffer } from '@/types/offers';
import { warsawToday, polishWeekday, type RecommendationContext } from '@/lib/recommendation-period';

/**
 * Message type for the chat interface.
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * AIRecommenderService interface as defined in the design document.
 */
export interface AIRecommenderService {
  getRecommendations(
    messages: ChatMessage[],
    availableOffers: LunchOffer[],
    userLocation?: Coordinates,
    context?: RecommendationContext,
    signal?: AbortSignal
  ): ReturnType<typeof streamText>;
}

/**
 * Builds the system prompt with dated offers for the resolved search period.
 * Instructs the AI to recommend 1-5 offers matching user preferences,
 * considering dietary restrictions, price preferences, and location.
 */
function buildSystemPrompt(
  availableOffers: LunchOffer[],
  userLocation?: Coordinates,
  context?: RecommendationContext
): string {
  const today = context?.today ?? warsawToday();
  const period = context?.period ?? { start: today, end: today };
  const offersContext = availableOffers.map((offer) => ({
    id: offer.id,
    dishName: offer.dishName,
    availableDate: offer.availableDate,
    weekday: polishWeekday(offer.availableDate),
    items: offer.items.slice(0, 10).map(item => item.slice(0, 100)),
    price: `${offer.price} ${offer.currency}`,
    description: offer.description?.slice(0, 400),
    restaurantName: offer.restaurantName,
    restaurantAddress: offer.restaurantAddress,
    cuisineType: offer.cuisineType,
    dietaryTags: offer.dietaryTags,
    allergens: offer.allergens,
    distanceKm: 'distanceKm' in offer ? offer.distanceKm : null,
  }));

  const locationContext = userLocation
    ? `\nLokalizacja użytkownika: ${userLocation.latitude}, ${userLocation.longitude}. Uwzględnij bliskość restauracji w rekomendacjach, jeśli użytkownik o to poprosi.`
    : '\nLokalizacja użytkownika nie jest dostępna.';

  return `Jesteś asystentem rekomendacji lunchowych. Pomagaj w wyborze posiłku na podstawie opublikowanych ofert w sprawdzonym okresie.
Dzisiejsza data (Europe/Warsaw): ${today}.
SPRAWDZONY OKRES: ${period.start} – ${period.end}.
${context?.clipped ? `Żądany okres: ${context.requestedPeriod.start} – ${context.requestedPeriod.end}. Obowiązkowo wyjaśnij, że sprawdzono tylko część w obsługiwanym zakresie (od dziś do 30 dni naprzód).` : ''}
${context?.incompleteDates.length ? `NIEPEŁNE WYNIKI: limit przeglądu osiągnięto dla dat: ${context.incompleteDates.join(', ')}. Obowiązkowo ujawnij niepełny przegląd. Brak dopasowania w tej próbce NIE oznacza braku pasujących ofert w bazie.` : 'Wyniki obejmują wszystkie opublikowane oferty spełniające zastosowane kryteria w sprawdzonym okresie.'}

ZASADY:
1. Rekomenduj TYLKO oferty z poniższej listy, zgodnie z availableDate i sprawdzonym okresem. Nie wymyślaj ofert ani dat.
2. Rekomenduj od 1 do 5 ofert, które najlepiej pasują do preferencji użytkownika.
3. Dla każdej rekomendacji podaj krótkie wyjaśnienie, dlaczego pasuje do preferencji użytkownika.
4. Uwzględniaj ograniczenia dietetyczne (wegetariańskie, wegańskie, bezglutenowe itp.), preferencje cenowe i lokalizację, gdy użytkownik je podaje.
5. Jeśli żadna oferta nie pasuje do preferencji użytkownika, poinformuj go o tym i zasugeruj rozszerzenie kryteriów (np. wyższy budżet, inna kuchnia, mniej restrykcyjna dieta).
6. Odpowiadaj w języku polskim, chyba że użytkownik pisze w innym języku.
7. Bądź zwięzły i pomocny. Podaj sprawdzony okres oraz datę i dzień tygodnia przy KAŻDEJ rekomendacji. Nie nazywaj przyszłych ofert dzisiejszymi.
8. Brak opublikowanych ofert nie dowodzi, że restauracja nie serwuje lunchu w danym dniu. Przy braku wyników określ okres i zastosowane preferencje, a nie stan całej restauracji.

DOSTĘPNE OFERTY W SPRAWDZONYM OKRESIE (${availableOffers.length} ofert):
${JSON.stringify(offersContext, null, 2)}
${locationContext}`;
}

/**
 * Creates an AIRecommenderService instance.
 * Uses Vercel AI SDK streamText with the Google provider for streaming responses.
 */
export function createAIRecommenderService(): AIRecommenderService {
  return {
    getRecommendations(
      messages: ChatMessage[],
      availableOffers: LunchOffer[],
      userLocation?: Coordinates,
      context?: RecommendationContext,
      signal?: AbortSignal
    ) {
      const systemPrompt = buildSystemPrompt(availableOffers, userLocation, context);

      // Convert messages to CoreMessage format for the AI SDK
      const coreMessages: CoreMessage[] = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      return streamText({
        maxRetries: 0,
        model: modelWithRateLimitFallback(),
        providerOptions: GEMINI_PROVIDER_OPTIONS,
        system: systemPrompt,
        messages: coreMessages,
        // The shared budget applies to the whole response. Racing
        // the stream against a timer is not possible — the result is handed
        // back before any token exists — so the deadline is enforced by
        // aborting the provider request instead.
        abortSignal: signal ?? AbortSignal.timeout(AI_TIMEOUT_MS),
      });
    },
  };
}
