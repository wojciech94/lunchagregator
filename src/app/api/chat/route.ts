import { NextResponse } from 'next/server';
import { createDataStreamResponse, formatDataStreamPart, StreamData } from 'ai';
import { createAIRecommenderService } from '@/services/ai-recommender';
import { identifyRecommendationIntent, searchRecommendationOffers } from '@/services/recommendation-search';
import { previousRecommendationPeriod, resolveRecommendationPeriod, warsawToday } from '@/lib/recommendation-period';
import { chatRequestSchema } from '@/lib/validations/chat';
import { AI_TIMEOUT_MS } from '@/lib/ai/constants';

export async function POST(request: Request) {
  let input: unknown;
  try { input = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const parsed = chatRequestSchema.safeParse(input);
  if (!parsed.success) {
    const messageIssue = parsed.error.issues.find(issue => issue.path.length === 1 && issue.path[0] === 'messages');
    const error = messageIssue?.code === 'too_big'
      ? 'Przekroczono limit 50 wiadomości na sesję. Rozpocznij nową sesję, aby kontynuować rozmowę.'
      : messageIssue?.code === 'invalid_type' ? 'Messages array is required.'
      : 'Nieprawidłowa wiadomość lub lokalizacja.';
    return NextResponse.json({ error }, { status: 400 });
  }
  const { messages, userLocation } = parsed.data;
  if (messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Dodaj swoją wiadomość, aby otrzymać rekomendację.' }, { status: 400 });
  }
  // One budget covers intent resolution, retrieval, streaming and model fallback.
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(AI_TIMEOUT_MS)]);
  try {
    const today = warsawToday();
    const previousPeriod = previousRecommendationPeriod(messages);
    const intent = await identifyRecommendationIntent(messages, today, signal, previousPeriod);
    const resolution = resolveRecommendationPeriod(intent, today, previousPeriod);
    if (resolution.message !== undefined) {
      return createDataStreamResponse({ execute: writer => {
        writer.write(formatDataStreamPart('text', resolution.message));
        writer.write(formatDataStreamPart('finish_message', { finishReason: 'stop' }));
      } });
    }
    const result = await searchRecommendationOffers(resolution.context, intent, userLocation, signal);
    signal.throwIfAborted();
    const stream = await createAIRecommenderService().getRecommendations(
      messages, result.offers, userLocation, result.context, signal,
    );
    const data = new StreamData();
    data.appendMessageAnnotation({
      type: 'recommendation-period', period: intent.period === 'default' ? null
        : { ...(intent.period === 'previous' ? previousPeriod : result.context.period) },
    });
    await data.close();
    return stream.toDataStreamResponse({ data });
  } catch (error) {
    console.error('Chat API route error:', error);
    return NextResponse.json({
      error: 'Usługa rekomendacji jest tymczasowo niedostępna. Spróbuj ponownie później.',
    }, { status: 503 });
  }
}
