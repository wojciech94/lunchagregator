import { streamText, type CoreMessage } from 'ai';
import { modelWithRateLimitFallback } from '@/lib/ai/model-with-fallback';
import { AI_TIMEOUT_MS, GEMINI_PROVIDER_OPTIONS } from '@/lib/ai/constants';
import type { Coordinates, LunchOffer } from '@/types/offers';

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
    userLocation?: Coordinates
  ): ReturnType<typeof streamText>;
}

/**
 * Builds the system prompt with today's available offers as context.
 * Instructs the AI to recommend 1-5 offers matching user preferences,
 * considering dietary restrictions, price preferences, and location.
 */
function buildSystemPrompt(
  availableOffers: LunchOffer[],
  userLocation?: Coordinates
): string {
  const offersContext = availableOffers.map((offer) => ({
    id: offer.id,
    dishName: offer.dishName,
    price: `${offer.price} ${offer.currency}`,
    description: offer.description,
    restaurantName: offer.restaurantName,
    restaurantAddress: offer.restaurantAddress,
    cuisineType: offer.cuisineType,
    dietaryTags: offer.dietaryTags,
    allergens: offer.allergens,
  }));

  const locationContext = userLocation
    ? `\nLokalizacja użytkownika: ${userLocation.latitude}, ${userLocation.longitude}. Uwzględnij bliskość restauracji w rekomendacjach, jeśli użytkownik o to poprosi.`
    : '\nLokalizacja użytkownika nie jest dostępna.';

  return `Jesteś asystentem rekomendacji lunchowych. Twoim zadaniem jest pomaganie użytkownikowi w wyborze posiłku na dziś na podstawie dostępnych ofert.

ZASADY:
1. Rekomenduj TYLKO oferty z poniższej listy dostępnych ofert na dziś.
2. Rekomenduj od 1 do 5 ofert, które najlepiej pasują do preferencji użytkownika.
3. Dla każdej rekomendacji podaj krótkie wyjaśnienie, dlaczego pasuje do preferencji użytkownika.
4. Uwzględniaj ograniczenia dietetyczne (wegetariańskie, wegańskie, bezglutenowe itp.), preferencje cenowe i lokalizację, gdy użytkownik je podaje.
5. Jeśli żadna oferta nie pasuje do preferencji użytkownika, poinformuj go o tym i zasugeruj rozszerzenie kryteriów (np. wyższy budżet, inna kuchnia, mniej restrykcyjna dieta).
6. Odpowiadaj w języku polskim, chyba że użytkownik pisze w innym języku.
7. Bądź zwięzły i pomocny.

DOSTĘPNE OFERTY NA DZIŚ (${availableOffers.length} ofert):
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
      userLocation?: Coordinates
    ) {
      const systemPrompt = buildSystemPrompt(availableOffers, userLocation);

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
        // Requirement 4.2 budgets the whole response at 10 seconds. Racing
        // the stream against a timer is not possible — the result is handed
        // back before any token exists — so the deadline is enforced by
        // aborting the provider request instead.
        abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });
    },
  };
}
