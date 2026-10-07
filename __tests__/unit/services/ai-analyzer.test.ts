import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the ai module before importing the service. The Google provider is
// left unmocked so the live model object can be asserted on modelId.
vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

import { analyzeText, analyzeUrl, analyzeImage } from '@/services/ai-analyzer';
import { generateObject } from 'ai';
import { AI_MODEL_ID } from '@/lib/ai/models';
import { RATE_LIMIT_MESSAGE } from '@/lib/ai/errors';
import { EXTRACTION_ERROR_MESSAGES } from '@/lib/ai/extraction-errors';

const mockGenerateObject = vi.mocked(generateObject);

describe('AIAnalyzerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeText', () => {
    it('should throw error when text exceeds 5000 characters', async () => {
      const longText = 'a'.repeat(5001);

      await expect(analyzeText(longText)).rejects.toThrow(
        'Text exceeds maximum length of 5000 characters'
      );
    });

    it('should return empty extraction for empty text', async () => {
      const result = await analyzeText('');

      expect(result).toEqual({
        offers: [],
        sourceType: 'text',
        confidence: 0,
        missingFields: ['restaurantName', 'dishName', 'price'],
      });
    });

    it('should return empty extraction for whitespace-only text', async () => {
      const result = await analyzeText('   ');

      expect(result).toEqual({
        offers: [],
        sourceType: 'text',
        confidence: 0,
        missingFields: ['restaurantName', 'dishName', 'price'],
      });
    });

    it('should extract offers from valid text', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          offers: [
            {
              restaurantName: 'Restauracja Pod Lipami',
              dishes: [
                {
                  name: 'Zupa dnia',
                  price: 12.0,
                  description: 'Krem z pomidorów',
                },
              ],
              address: 'ul. Kwiatowa 5',
            },
          ],
          confidence: 0.9,
        },
      } as never);

      const result = await analyzeText(
        'Restauracja Pod Lipami, ul. Kwiatowa 5. Zupa dnia - krem z pomidorów 12 zł'
      );

      expect(result.sourceType).toBe('text');
      expect(result.confidence).toBe(0.9);
      expect(result.offers).toHaveLength(1);
      expect(result.offers[0].restaurantName).toBe('Restauracja Pod Lipami');
      expect(result.offers[0].dishes[0].name).toBe('Zupa dnia');
      expect(result.offers[0].dishes[0].price).toBe(12.0);
      expect(result.missingFields).toEqual([]);
    });

    it('should accept text at exactly 5000 characters', async () => {
      const exactText = 'a'.repeat(5000);

      mockGenerateObject.mockResolvedValueOnce({
        object: {
          offers: [],
          confidence: 0,
        },
      } as never);

      const result = await analyzeText(exactText);
      expect(result.sourceType).toBe('text');
    });

    it('should identify missing fields when extraction is partial', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          offers: [
            {
              restaurantName: null,
              dishes: [
                {
                  name: 'Zupa dnia',
                  price: null,
                },
              ],
            },
          ],
          confidence: 0.4,
        },
      } as never);

      const result = await analyzeText('Zupa dnia - smaczna');

      expect(result.missingFields).toContain('restaurantName');
      expect(result.missingFields).toContain('price');
    });

    it('should return fallback on AI timeout', async () => {
      vi.useFakeTimers();
      try {
        mockGenerateObject.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              setTimeout(
                () => resolve({ object: { offers: [], confidence: 0 } } as never),
                10000
              );
            })
        );

        let settled = false;
        const pending = analyzeText('Some text').then((r) => {
          settled = true;
          return r;
        });

        // Requirement 4.2 budgets the response at 10 seconds, so the call
        // must still be in flight one tick earlier.
        await vi.advanceTimersByTimeAsync(9999);
        expect(settled).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        const result = await pending;

        expect(result).toEqual({
          offers: [],
          sourceType: 'text',
          confidence: 0,
          missingFields: ['restaurantName', 'dishName', 'price'],
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('should clear the timeout once the AI call returns', async () => {
      vi.useFakeTimers();
      const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
      try {
        mockGenerateObject.mockResolvedValueOnce({
          object: { offers: [], confidence: 0 },
        } as never);

        await analyzeText('Some text');

        expect(clearSpy).toHaveBeenCalled();
      } finally {
        clearSpy.mockRestore();
        vi.useRealTimers();
      }
    });

    it('should return the empty extraction with a rate-limit message on 429', async () => {
      mockGenerateObject.mockRejectedValueOnce(
        Object.assign(new Error('Too many requests'), { statusCode: 429 })
      );

      const result = await analyzeText('Some text');

      expect(result).toEqual({
        offers: [],
        sourceType: 'text',
        confidence: 0,
        missingFields: ['restaurantName', 'dishName', 'price'],
        message: RATE_LIMIT_MESSAGE,
      });
    });

    it('should distinguish an ordinary AI failure from no offers', async () => {
      mockGenerateObject.mockRejectedValueOnce(new Error('API error'));

      const result = await analyzeText('Some text');

      expect(result.message).toBe(EXTRACTION_ERROR_MESSAGES.unavailable);
    });

    it('should call the pinned Google model with thinking off', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: { offers: [], confidence: 0 },
      } as never);

      await analyzeText('Some text');

      const callArgs = mockGenerateObject.mock.calls[0][0];
      expect(callArgs.model.modelId).toBe(AI_MODEL_ID);
      expect(callArgs.model.provider).toBe('google.generative-ai');
      expect(callArgs.providerOptions).toEqual({
        google: { thinkingConfig: { thinkingBudget: 0 } },
      });
    });

    it('should return fallback on AI error', async () => {
      mockGenerateObject.mockRejectedValueOnce(new Error('API error'));

      const result = await analyzeText('Some text');

      expect(result).toEqual({
        offers: [],
        sourceType: 'text',
        confidence: 0,
        missingFields: ['restaurantName', 'dishName', 'price'],
        message: EXTRACTION_ERROR_MESSAGES.unavailable,
      });
    });
  });

  describe('analyzeUrl', () => {
    it('should extract offers from a URL', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          offers: [
            {
              restaurantName: 'Pizza Hut',
              dishes: [
                { name: 'Margherita', price: 29.99, description: 'Classic pizza' },
              ],
            },
          ],
          confidence: 0.85,
        },
      } as never);

      const result = await analyzeUrl('https://example.com/menu');

      expect(result.sourceType).toBe('link');
      expect(result.confidence).toBe(0.85);
      expect(result.offers[0].restaurantName).toBe('Pizza Hut');
      expect(result.missingFields).toEqual([]);
    });

    it('should return fallback on AI failure', async () => {
      mockGenerateObject.mockRejectedValueOnce(new Error('Network error'));

      const result = await analyzeUrl('https://example.com/menu');

      expect(result).toEqual({
        offers: [],
        sourceType: 'link',
        confidence: 0,
        missingFields: ['restaurantName', 'dishName', 'price'],
        message: EXTRACTION_ERROR_MESSAGES.unavailable,
      });
    });
  });

  describe('analyzeImage', () => {
    it('should extract offers from an image URL', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          offers: [
            {
              restaurantName: 'Bistro Cafe',
              dishes: [
                { name: 'Sałatka Cezar', price: 22.0 },
                { name: 'Burger klasyczny', price: 35.0 },
              ],
            },
          ],
          confidence: 0.7,
        },
      } as never);

      const result = await analyzeImage('https://storage.example.com/menu.jpg');

      expect(result.sourceType).toBe('photo');
      expect(result.confidence).toBe(0.7);
      expect(result.offers[0].dishes).toHaveLength(2);
      expect(result.missingFields).toEqual([]);

      // Requirement 5.3: the photo itself must reach the model. Without this
      // the test still passes if the image part stops being sent.
      const callArgs = mockGenerateObject.mock.calls[0][0];
      const parts = callArgs.messages?.[0].content;
      expect(parts).toContainEqual({
        type: 'image',
        image: 'https://storage.example.com/menu.jpg',
      });
    });

    it('should call the pinned Google model with thinking off', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: { offers: [], confidence: 0 },
      } as never);

      await analyzeImage('https://storage.example.com/menu.jpg');

      const callArgs = mockGenerateObject.mock.calls[0][0];
      expect(callArgs.model.modelId).toBe(AI_MODEL_ID);
      expect(callArgs.providerOptions).toEqual({
        google: { thinkingConfig: { thinkingBudget: 0 } },
      });
    });

    it('should return fallback on AI failure', async () => {
      mockGenerateObject.mockRejectedValueOnce(new Error('Vision model error'));

      const result = await analyzeImage('https://storage.example.com/menu.jpg');

      expect(result).toEqual({
        offers: [],
        sourceType: 'photo',
        confidence: 0,
        missingFields: ['restaurantName', 'dishName', 'price'],
        message: EXTRACTION_ERROR_MESSAGES.unavailable,
      });
    });

    it('should return the empty extraction with a rate-limit message on 429', async () => {
      mockGenerateObject.mockRejectedValueOnce(
        Object.assign(new Error('Resource exhausted'), { statusCode: 429 })
      );

      const result = await analyzeImage('https://storage.example.com/menu.jpg');

      expect(result.message).toBe(RATE_LIMIT_MESSAGE);
      expect(result.offers).toEqual([]);
    });
  });

  describe('missing fields detection', () => {
    it('should detect missing restaurant name', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          offers: [
            {
              restaurantName: null,
              dishes: [{ name: 'Zupa', price: 10 }],
            },
          ],
          confidence: 0.5,
        },
      } as never);

      const result = await analyzeText('Zupa 10 zł');
      expect(result.missingFields).toContain('restaurantName');
    });

    it('should detect missing dish name', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          offers: [
            {
              restaurantName: 'Test Restaurant',
              dishes: [{ name: null, price: 15 }],
            },
          ],
          confidence: 0.5,
        },
      } as never);

      const result = await analyzeText('Test Restaurant 15 zł');
      expect(result.missingFields).toContain('dishName');
    });

    it('should detect missing price', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          offers: [
            {
              restaurantName: 'Test Restaurant',
              dishes: [{ name: 'Zupa', price: null }],
            },
          ],
          confidence: 0.5,
        },
      } as never);

      const result = await analyzeText('Test Restaurant - Zupa');
      expect(result.missingFields).toContain('price');
    });

    it('should detect all missing fields when no dishes extracted', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          offers: [
            {
              restaurantName: 'Test Restaurant',
              dishes: [],
            },
          ],
          confidence: 0.3,
        },
      } as never);

      const result = await analyzeText('Test Restaurant');
      expect(result.missingFields).toContain('dishName');
      expect(result.missingFields).toContain('price');
    });

    it('should return no missing fields when all required fields present', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          offers: [
            {
              restaurantName: 'Full Restaurant',
              dishes: [
                { name: 'Dish 1', price: 20 },
                { name: 'Dish 2', price: 25 },
              ],
            },
          ],
          confidence: 0.95,
        },
      } as never);

      const result = await analyzeText('Full Restaurant - Dish 1 20zł, Dish 2 25zł');
      expect(result.missingFields).toEqual([]);
    });
  });
});
