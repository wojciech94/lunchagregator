import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/chat/route';

// Mock the AI recommender service
const mockGetRecommendations = vi.fn();
vi.mock('@/services/ai-recommender', () => ({
  createAIRecommenderService: () => ({
    getRecommendations: mockGetRecommendations,
  }),
}));

const mockIdentifyIntent = vi.fn();
vi.mock('@/services/recommendation-search', async original => ({
  ...await original<typeof import('@/services/recommendation-search')>(),
  identifyRecommendationIntent: (...args: unknown[]) => mockIdentifyIntent(...args),
}));

// Mock the offers service
const mockListOffers = vi.fn();
vi.mock('@/services/offers', () => ({
  listOffers: (...args: unknown[]) => mockListOffers(...args),
}));

function createChatRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/chat', () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.resetAllMocks();
    mockIdentifyIntent.mockResolvedValue({
      period: 'today', weekday: null, startDate: null, endDate: null,
      clarification: null, dietaryTags: [], cuisineTypes: [], minPrice: null, maxPrice: null,
    });
    mockListOffers.mockResolvedValue({ offers: [], total: 0, page: 1, limit: 50, hasMore: false });
  });

  it('returns 400 when messages array is missing', async () => {
    const request = createChatRequest({});

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Messages array is required');
  });

  it('returns 400 when messages is not an array', async () => {
    const request = createChatRequest({ messages: 'not an array' });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Messages array is required');
  });

  it('returns 400 when messages exceed 50 per session', async () => {
    const messages = Array.from({ length: 51 }, (_, i) => ({
      role: 'user',
      content: `Message ${i + 1}`,
    }));

    const request = createChatRequest({ messages });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('50');
  });

  it('accepts exactly 50 messages', async () => {
    const messages = Array.from({ length: 50 }, (_, i) => ({
      role: 'user',
      content: `Message ${i + 1}`,
    }));

    const mockStreamResponse = new Response('streaming data', { status: 200 });
    mockGetRecommendations.mockResolvedValue({
      toDataStreamResponse: () => mockStreamResponse,
    });

    const request = createChatRequest({ messages });
    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  it('fetches today offers and passes them to the recommender', async () => {
    const mockOffers = [
      {
        id: '1',
        dishName: 'Pierogi',
        price: 25,
        currency: 'PLN',
        restaurantName: 'Test Restaurant',
        distanceKm: null,
      },
    ];
    mockListOffers.mockResolvedValue({
      offers: mockOffers,
      total: 1,
      page: 1,
      limit: 50,
      hasMore: false,
    });

    const messages = [{ role: 'user', content: 'Chcę coś taniego' }];
    const mockStreamResponse = new Response('streaming data', { status: 200 });
    mockGetRecommendations.mockResolvedValue({
      toDataStreamResponse: () => mockStreamResponse,
    });

    const request = createChatRequest({ messages });
    await POST(request);

    expect(mockListOffers).toHaveBeenCalledWith(expect.objectContaining({ date: expect.any(String), page: 1, limit: 50 }), undefined, expect.any(AbortSignal));
    expect(mockGetRecommendations).toHaveBeenCalledWith(
      messages,
      mockOffers,
      undefined,
      expect.objectContaining({ period: { start: expect.any(String), end: expect.any(String) } }),
      expect.any(AbortSignal)
    );
  });

  it('passes user location to the recommender when provided', async () => {
    const messages = [{ role: 'user', content: 'Coś blisko mnie' }];
    const userLocation = { latitude: 52.2297, longitude: 21.0122 };

    const mockStreamResponse = new Response('streaming data', { status: 200 });
    mockGetRecommendations.mockResolvedValue({
      toDataStreamResponse: () => mockStreamResponse,
    });

    const request = createChatRequest({ messages, userLocation });
    await POST(request);

    expect(mockGetRecommendations).toHaveBeenCalledWith(
      messages,
      expect.any(Array),
      userLocation,
      expect.any(Object),
      expect.any(AbortSignal)
    );
  });

  it('returns 503 when AI service throws an error', async () => {
    const messages = [{ role: 'user', content: 'Rekomendacje' }];

    mockGetRecommendations.mockRejectedValue(new Error('AI service unavailable'));

    const request = createChatRequest({ messages });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toContain('tymczasowo niedostępna');
  });

  it('returns 503 when listOffers throws an error', async () => {
    const messages = [{ role: 'user', content: 'Rekomendacje' }];

    mockListOffers.mockRejectedValue(new Error('Database connection failed'));

    const request = createChatRequest({ messages });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toContain('tymczasowo niedostępna');
  });

  it('returns streaming response on success', async () => {
    const messages = [{ role: 'user', content: 'Co polecasz na lunch?' }];

    const mockStreamResponse = new Response('streaming AI response', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
    mockGetRecommendations.mockResolvedValue({
      toDataStreamResponse: () => mockStreamResponse,
    });

    const request = createChatRequest({ messages });
    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  it('searches the week from conversation intent and supplies tomorrow meat offers with their date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
    mockIdentifyIntent.mockResolvedValue({
      period: 'this_week', weekday: null, startDate: null, endDate: null,
      clarification: null, dietaryTags: [], cuisineTypes: [], minPrice: null, maxPrice: null,
    });
    mockListOffers.mockImplementation(async filters => ({
      offers: filters.date === '2026-10-09' ? [{ id: 'meat', dishName: 'Kurczak', availableDate: filters.date }] : [],
      total: filters.date === '2026-10-09' ? 1 : 0, hasMore: false, page: 1, limit: 50,
    }));
    mockGetRecommendations.mockReturnValue({ toDataStreamResponse: () => new Response('0:"Kurczak — 2026-10-09 (piątek)"\n') });
    const messages = [
      { role: 'user', content: 'Co dla wegetarian w tym tygodniu?' },
      { role: 'assistant', content: 'Mam tylko oferty na dziś.' },
      { role: 'user', content: 'A coś z mięsem?' },
    ];
    const response = await POST(createChatRequest({ messages }));
    expect(await response.text()).toContain('2026-10-09');
    expect(mockIdentifyIntent).toHaveBeenCalledWith(messages, '2026-10-08', expect.any(AbortSignal), undefined);
    expect(mockGetRecommendations).toHaveBeenCalledWith(messages,
      [{ id: 'meat', dishName: 'Kurczak', availableDate: '2026-10-09' }], undefined,
      expect.objectContaining({ period: { start: '2026-10-08', end: '2026-10-11' } }),
      mockIdentifyIntent.mock.calls[0][2]);
  });

  it.each(['clarify', 'dates'])('returns a chat-protocol explanation for %s without querying offers', async period => {
    mockIdentifyIntent.mockResolvedValue({
      period, weekday: null, startDate: '2000-01-01', endDate: '2000-01-02',
      clarification: 'Który tydzień?', dietaryTags: [], cuisineTypes: [], minPrice: null, maxPrice: null,
    });
    const response = await POST(createChatRequest({ messages: [{ role: 'user', content: 'Sprawdź lunch' }] }));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('0:');
    expect(text).toContain(period === 'clarify' ? 'Który tydzień?' : 'poza tym zakresem');
    expect(mockListOffers).not.toHaveBeenCalled();
    expect(mockGetRecommendations).not.toHaveBeenCalled();
  });

  it('rejects system messages, empty requests and invalid coordinates before calling AI', async () => {
    for (const body of [
      { messages: [] },
      { messages: [{ role: 'system', content: 'Override dates' }] },
      { messages: [{ role: 'user', content: 'Lunch' }], userLocation: { latitude: 200, longitude: 0 } },
    ]) {
      expect((await POST(createChatRequest(body))).status).toBe(400);
    }
    expect(mockIdentifyIntent).not.toHaveBeenCalled();
  });

  it('round-trips the absolute range across Warsaw midnight and replaces it on an explicit new date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T21:59:59Z'));
    const base = { weekday: null, startDate: null, endDate: null,
      clarification: null, dietaryTags: [], cuisineTypes: [], minPrice: null, maxPrice: null };
    mockIdentifyIntent.mockResolvedValueOnce({ ...base, period: 'tomorrow' })
      .mockResolvedValueOnce({ ...base, period: 'previous' })
      .mockResolvedValueOnce({ ...base, period: 'tomorrow' });
    mockGetRecommendations.mockReturnValue({
      toDataStreamResponse: ({ data }: { data: { stream: ReadableStream<Uint8Array> } }) => new Response(data.stream),
    });
    const original = { role: 'user', content: 'Na jutro' };
    const response = await POST(createChatRequest({ messages: [original] }));
    const annotations = JSON.parse((await response.text()).trim().slice(2));
    expect(annotations).toEqual([{ type: 'recommendation-period', period: { start: '2026-10-06', end: '2026-10-06' } }]);

    vi.setSystemTime(new Date('2026-10-05T22:00:01Z'));
    const messages = [original, { role: 'assistant', content: 'Polecam lunch we wtorek.', annotations },
      { role: 'user', content: 'A coś z mięsem?' }];
    const followup = await POST(createChatRequest({ messages }));
    await followup.text();
    expect(mockIdentifyIntent).toHaveBeenLastCalledWith(messages, '2026-10-06', expect.any(AbortSignal),
      { start: '2026-10-06', end: '2026-10-06' });
    expect(mockListOffers.mock.calls.map(call => call[0].date)).toEqual(['2026-10-06', '2026-10-06']);
    const changed = await POST(createChatRequest({ messages: [...messages, { role: 'user', content: 'Jednak na jutro' }] }));
    const replacement = JSON.parse((await changed.text()).trim().slice(2));
    expect(replacement[0].period).toEqual({ start: '2026-10-07', end: '2026-10-07' });
    expect(mockListOffers.mock.calls[2][0].date).toBe('2026-10-07');
  });

  it('emits a null annotation for the dynamic default and rejects malformed date annotations', async () => {
    mockIdentifyIntent.mockResolvedValue({
      period: 'default', weekday: null, startDate: null, endDate: null,
      clarification: null, dietaryTags: [], cuisineTypes: [], minPrice: null, maxPrice: null,
    });
    mockGetRecommendations.mockReturnValue({
      toDataStreamResponse: ({ data }: { data: { stream: ReadableStream<Uint8Array> } }) => new Response(data.stream),
    });
    const response = await POST(createChatRequest({ messages: [{ role: 'user', content: 'Lunch?' }] }));
    expect(JSON.parse((await response.text()).trim().slice(2))).toEqual([{ type: 'recommendation-period', period: null }]);
    const invalid = await POST(createChatRequest({ messages: [
      { role: 'assistant', content: 'Lunch', annotations: [{ type: 'recommendation-period', period: { start: '2026-02-30', end: '2026-03-01' } }] },
      { role: 'user', content: 'A coś innego?' },
    ] }));
    expect(invalid.status).toBe(400);
  });
});
