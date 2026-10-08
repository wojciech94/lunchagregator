import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LunchOffer, Coordinates } from '@/types/offers';

// Keep the real model wrapper; mock only the streaming entry point.
// The colocated tests cover the actual SDK transport and fallback policy.
vi.mock('ai', async (importOriginal) => ({
  ...await importOriginal<typeof import('ai')>(),
  streamText: vi.fn(),
}));

import { streamText } from 'ai';
import { createAIRecommenderService, type ChatMessage } from '@/services/ai-recommender';
import { AI_MODEL_ID } from '@/lib/ai/models';

const mockedStreamText = vi.mocked(streamText);
afterEach(() => vi.restoreAllMocks());

function createMockOffer(overrides: Partial<LunchOffer> = {}): LunchOffer {
  return {
    id: 'offer-1',
    dishName: 'Pierogi ruskie',
    items: [],
    price: 25.0,
    currency: 'PLN',
    description: 'Tradycyjne pierogi z serem i ziemniakami',
    restaurantName: 'Restauracja Polska',
    restaurantAddress: 'ul. Marszałkowska 10, Warszawa',
    restaurantLocation: { latitude: 52.2297, longitude: 21.0122 },
    availableDate: new Date().toISOString().split('T')[0],
    cuisineType: 'polska',
    dietaryTags: ['vegetarian'],
    allergens: ['gluten', 'mleko'],
    sourceType: 'text',
    userId: null,
    sessionToken: 'session-123',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('AIRecommenderService', () => {
  let service: ReturnType<typeof createAIRecommenderService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedStreamText.mockReturnValue({} as ReturnType<typeof streamText>);
    service = createAIRecommenderService();
  });

  describe('getRecommendations', () => {
    it('should call streamText with system prompt containing available offers', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Chcę coś taniego i wegetariańskiego' },
      ];
      const offers = [createMockOffer()];

      service.getRecommendations(messages, offers);

      expect(mockedStreamText).toHaveBeenCalledTimes(1);
      const callArgs = mockedStreamText.mock.calls[0][0];

      // System prompt should contain offer data
      expect(callArgs.system).toContain('Pierogi ruskie');
      expect(callArgs.system).toContain('Restauracja Polska');
      expect(callArgs.system).toContain('25 PLN');
    });

    it('should include user location context when provided', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Co jest blisko mnie?' },
      ];
      const offers = [createMockOffer()];
      const userLocation: Coordinates = { latitude: 52.23, longitude: 21.01 };

      service.getRecommendations(messages, offers, userLocation);

      const callArgs = mockedStreamText.mock.calls[0][0];
      expect(callArgs.system).toContain('52.23');
      expect(callArgs.system).toContain('21.01');
      expect(callArgs.system).toContain('Lokalizacja użytkownika');
    });

    it('should indicate location is unavailable when not provided', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Polecisz coś?' },
      ];
      const offers = [createMockOffer()];

      service.getRecommendations(messages, offers);

      const callArgs = mockedStreamText.mock.calls[0][0];
      expect(callArgs.system).toContain('Lokalizacja użytkownika nie jest dostępna');
    });

    it('should pass messages in CoreMessage format', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Chcę coś lekkiego' },
        { role: 'assistant', content: 'Polecam sałatkę!' },
        { role: 'user', content: 'A coś ciepłego?' },
      ];
      const offers = [createMockOffer()];

      service.getRecommendations(messages, offers);

      const callArgs = mockedStreamText.mock.calls[0][0];
      expect(callArgs.messages).toEqual([
        { role: 'user', content: 'Chcę coś lekkiego' },
        { role: 'assistant', content: 'Polecam sałatkę!' },
        { role: 'user', content: 'A coś ciepłego?' },
      ]);
    });

    it('should include dietary tags and allergens in offer context', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Szukam czegoś wegańskiego' },
      ];
      const offers = [
        createMockOffer({
          dietaryTags: ['vegan', 'gluten-free'],
          allergens: ['soja'],
        }),
      ];

      service.getRecommendations(messages, offers);

      const callArgs = mockedStreamText.mock.calls[0][0];
      expect(callArgs.system).toContain('vegan');
      expect(callArgs.system).toContain('gluten-free');
      expect(callArgs.system).toContain('soja');
    });

    it('should handle empty offers list', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Co macie na dziś?' },
      ];
      const offers: LunchOffer[] = [];

      service.getRecommendations(messages, offers);

      const callArgs = mockedStreamText.mock.calls[0][0];
      expect(callArgs.system).toContain('0 ofert');
    });

    it('should include multiple offers in context', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Pokaż mi opcje' },
      ];
      const offers = [
        createMockOffer({ id: '1', dishName: 'Pierogi', restaurantName: 'Polska' }),
        createMockOffer({ id: '2', dishName: 'Pizza', restaurantName: 'Italiana' }),
        createMockOffer({ id: '3', dishName: 'Sushi', restaurantName: 'Tokyo' }),
      ];

      service.getRecommendations(messages, offers);

      const callArgs = mockedStreamText.mock.calls[0][0];
      expect(callArgs.system).toContain('Pierogi');
      expect(callArgs.system).toContain('Pizza');
      expect(callArgs.system).toContain('Sushi');
      expect(callArgs.system).toContain('3 ofert');
    });

    it('should include instructions about recommending 1-5 offers', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Polecisz coś?' },
      ];
      const offers = [createMockOffer()];

      service.getRecommendations(messages, offers);

      const callArgs = mockedStreamText.mock.calls[0][0];
      expect(callArgs.system).toContain('1 do 5');
    });

    it('should include instructions about broadening criteria when no match', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Polecisz coś?' },
      ];
      const offers = [createMockOffer()];

      service.getRecommendations(messages, offers);

      const callArgs = mockedStreamText.mock.calls[0][0];
      expect(callArgs.system).toContain('rozszerzenie kryteriów');
    });

    it('should include instructions about dietary restrictions filtering', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Polecisz coś?' },
      ];
      const offers = [createMockOffer()];

      service.getRecommendations(messages, offers);

      const callArgs = mockedStreamText.mock.calls[0][0];
      expect(callArgs.system).toContain('dietetyczne');
    });

    it('should use the pinned Google model', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Polecisz coś?' },
      ];
      const offers = [createMockOffer()];

      service.getRecommendations(messages, offers);

      const callArgs = mockedStreamText.mock.calls[0][0];
      expect(callArgs.model.modelId).toBe(AI_MODEL_ID);
      expect(callArgs.model.provider).toBe('google.generative-ai');
    });

    it('uses provider-default thinking without SDK retries', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Polecisz coś?' },
      ];

      service.getRecommendations(messages, [createMockOffer()]);

      const callArgs = mockedStreamText.mock.calls[0][0];
      expect(callArgs.providerOptions).toBeUndefined();
      expect(callArgs.maxRetries).toBe(0);
    });

    it('applies the shared 25-second deadline to the provider call', () => {
      const timeout = vi.spyOn(AbortSignal, 'timeout');
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Polecisz coś?' },
      ];

      service.getRecommendations(messages, [createMockOffer()]);

      const callArgs = mockedStreamText.mock.calls[0][0];
      expect(callArgs.abortSignal).toBeInstanceOf(AbortSignal);
      expect(callArgs.abortSignal?.aborted).toBe(false);
      expect(timeout).toHaveBeenCalledWith(25000);
    });

    it('includes future availability dates, weekdays and the searched week without today-only instructions', () => {
      service.getRecommendations([{ role: 'user', content: 'Co z mięsem w tym tygodniu?' }],
        [createMockOffer({ dishName: 'Kurczak', availableDate: '2026-10-09' })], undefined,
        { today: '2026-10-08', requestedPeriod: { start: '2026-10-08', end: '2026-10-11' },
          period: { start: '2026-10-08', end: '2026-10-11' }, clipped: false, incompleteDates: [] });
      const system = mockedStreamText.mock.calls[0][0].system!;
      expect(system).toContain('2026-10-08 – 2026-10-11');
      expect(system).toContain('"availableDate": "2026-10-09"');
      expect(system).toContain('piątek');
      expect(system).not.toContain('TYLKO oferty z poniższej listy dostępnych ofert na dziś');
    });

    it('discloses clipped periods and incomplete searches and reuses the caller deadline', () => {
      const signal = new AbortController().signal;
      service.getRecommendations([{ role: 'user', content: 'Cały miesiąc' }], [], undefined,
        { today: '2026-10-08', requestedPeriod: { start: '2026-10-01', end: '2026-11-30' },
          period: { start: '2026-10-08', end: '2026-11-07' }, clipped: true, incompleteDates: ['2026-10-09'] }, signal);
      const call = mockedStreamText.mock.calls[0][0];
      expect(call.abortSignal).toBe(signal);
      expect(call.system).toContain('sprawdzono tylko część');
      expect(call.system).toContain('NIEPEŁNE WYNIKI');
      expect(call.system).toContain('NIE oznacza braku');
      expect(call.system).not.toContain('Wyniki obejmują wszystkie');
    });
  });
});
