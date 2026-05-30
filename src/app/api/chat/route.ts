import { NextResponse } from 'next/server';
import { createAIRecommenderService, type ChatMessage } from '@/services/ai-recommender';
import { listOffers } from '@/services/offers';
import type { Coordinates } from '@/types/offers';

const MAX_MESSAGES_PER_SESSION = 50;

interface ChatRequestBody {
  messages: ChatMessage[];
  userLocation?: Coordinates;
}

export async function POST(request: Request) {
  try {
    const body: ChatRequestBody = await request.json();
    const { messages, userLocation } = body;

    // Validate messages array exists
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Messages array is required.' },
        { status: 400 }
      );
    }

    // Enforce 50-message-per-session limit
    if (messages.length > MAX_MESSAGES_PER_SESSION) {
      return NextResponse.json(
        {
          error: `Przekroczono limit ${MAX_MESSAGES_PER_SESSION} wiadomości na sesję. Rozpocznij nową sesję, aby kontynuować rozmowę.`,
        },
        { status: 400 }
      );
    }

    // Fetch today's available offers as context for the AI
    const offersResult = await listOffers({});
    const availableOffers = offersResult.offers;

    // Create the AI recommender service and get streaming response
    const recommenderService = createAIRecommenderService();
    const result = await recommenderService.getRecommendations(
      messages,
      availableOffers,
      userLocation
    );

    // Return the streaming response using Vercel AI SDK format
    return result.toDataStreamResponse();
  } catch (error) {
    console.error('Chat API route error:', error);

    // Handle AI service unavailability
    return NextResponse.json(
      {
        error: 'Usługa rekomendacji jest tymczasowo niedostępna. Spróbuj ponownie później.',
      },
      { status: 503 }
    );
  }
}
