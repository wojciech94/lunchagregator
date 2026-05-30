import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/chat/route';

// Mock the AI recommender service
const mockGetRecommendations = vi.fn();
vi.mock('@/services/ai-recommender', () => ({
  createAIRecommenderService: () => ({
    getRecommendations: mockGetRecommendations,
  }),
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
  beforeEach(() => {
    vi.clearAllMocks();
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

    expect(mockListOffers).toHaveBeenCalledWith({});
    expect(mockGetRecommendations).toHaveBeenCalledWith(
      messages,
      mockOffers,
      undefined
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
      userLocation
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
});
