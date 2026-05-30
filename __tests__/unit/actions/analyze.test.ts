import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeUrlAction, analyzeTextAction, analyzeImageAction } from '@/actions/analyze';
import type { ExtractedOffers } from '@/services/ai-analyzer';

// Mock the ai-analyzer service
vi.mock('@/services/ai-analyzer', () => ({
  analyzeUrl: vi.fn(),
  analyzeText: vi.fn(),
  analyzeImage: vi.fn(),
}));

import { analyzeUrl, analyzeText, analyzeImage } from '@/services/ai-analyzer';

const mockAnalyzeUrl = analyzeUrl as ReturnType<typeof vi.fn>;
const mockAnalyzeText = analyzeText as ReturnType<typeof vi.fn>;
const mockAnalyzeImage = analyzeImage as ReturnType<typeof vi.fn>;

const mockExtractedOffers: ExtractedOffers = {
  offers: [
    {
      restaurantName: 'Test Restaurant',
      dishes: [{ name: 'Lunch Special', price: 25.0 }],
      address: 'ul. Testowa 1',
    },
  ],
  sourceType: 'link',
  confidence: 0.9,
  missingFields: [],
};

describe('analyze server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeUrlAction', () => {
    it('returns error for empty URL', async () => {
      const result = await analyzeUrlAction('');
      expect(result).toEqual({ success: false, error: 'URL jest wymagany.' });
      expect(mockAnalyzeUrl).not.toHaveBeenCalled();
    });

    it('returns error for whitespace-only URL', async () => {
      const result = await analyzeUrlAction('   ');
      expect(result).toEqual({ success: false, error: 'URL jest wymagany.' });
    });

    it('returns error for invalid URL format', async () => {
      const result = await analyzeUrlAction('not-a-url');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('nieprawidłowy');
      }
    });

    it('returns error for URL without protocol', async () => {
      const result = await analyzeUrlAction('www.example.com');
      expect(result.success).toBe(false);
    });

    it('returns success with extracted data for valid URL', async () => {
      mockAnalyzeUrl.mockResolvedValue(mockExtractedOffers);

      const result = await analyzeUrlAction('https://restaurant.pl/menu');

      expect(result).toEqual({ success: true, data: mockExtractedOffers });
      expect(mockAnalyzeUrl).toHaveBeenCalledWith('https://restaurant.pl/menu');
    });

    it('trims URL before processing', async () => {
      mockAnalyzeUrl.mockResolvedValue(mockExtractedOffers);

      await analyzeUrlAction('  https://restaurant.pl/menu  ');

      expect(mockAnalyzeUrl).toHaveBeenCalledWith('https://restaurant.pl/menu');
    });

    it('returns error when AI service throws', async () => {
      mockAnalyzeUrl.mockRejectedValue(new Error('AI service unavailable'));

      const result = await analyzeUrlAction('https://restaurant.pl/menu');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Nie udało się przeanalizować');
      }
    });

    it('accepts http:// URLs', async () => {
      mockAnalyzeUrl.mockResolvedValue(mockExtractedOffers);

      const result = await analyzeUrlAction('http://restaurant.pl/menu');

      expect(result.success).toBe(true);
    });
  });

  describe('analyzeTextAction', () => {
    it('returns error for empty text', async () => {
      const result = await analyzeTextAction('');
      expect(result).toEqual({ success: false, error: 'Tekst jest wymagany.' });
      expect(mockAnalyzeText).not.toHaveBeenCalled();
    });

    it('returns error for whitespace-only text', async () => {
      const result = await analyzeTextAction('   ');
      expect(result).toEqual({ success: false, error: 'Tekst jest wymagany.' });
    });

    it('returns error for text exceeding 5000 characters', async () => {
      const longText = 'a'.repeat(5001);
      const result = await analyzeTextAction(longText);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('5000');
      }
      expect(mockAnalyzeText).not.toHaveBeenCalled();
    });

    it('accepts text at exactly 5000 characters', async () => {
      const text = 'a'.repeat(5000);
      mockAnalyzeText.mockResolvedValue({ ...mockExtractedOffers, sourceType: 'text' });

      const result = await analyzeTextAction(text);

      expect(result.success).toBe(true);
      expect(mockAnalyzeText).toHaveBeenCalled();
    });

    it('returns success with extracted data for valid text', async () => {
      const textResult = { ...mockExtractedOffers, sourceType: 'text' as const };
      mockAnalyzeText.mockResolvedValue(textResult);

      const result = await analyzeTextAction('Restauracja ABC: Zupa dnia 15 zł');

      expect(result).toEqual({ success: true, data: textResult });
      expect(mockAnalyzeText).toHaveBeenCalledWith('Restauracja ABC: Zupa dnia 15 zł');
    });

    it('trims text before processing', async () => {
      mockAnalyzeText.mockResolvedValue({ ...mockExtractedOffers, sourceType: 'text' });

      await analyzeTextAction('  some text  ');

      expect(mockAnalyzeText).toHaveBeenCalledWith('some text');
    });

    it('returns error when AI service throws', async () => {
      mockAnalyzeText.mockRejectedValue(new Error('AI service unavailable'));

      const result = await analyzeTextAction('Valid text input');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Nie udało się przeanalizować');
      }
    });
  });

  describe('analyzeImageAction', () => {
    it('returns error for empty image URL', async () => {
      const result = await analyzeImageAction('');
      expect(result).toEqual({ success: false, error: 'URL obrazu jest wymagany.' });
      expect(mockAnalyzeImage).not.toHaveBeenCalled();
    });

    it('returns error for whitespace-only image URL', async () => {
      const result = await analyzeImageAction('   ');
      expect(result).toEqual({ success: false, error: 'URL obrazu jest wymagany.' });
    });

    it('returns error for invalid image URL format', async () => {
      const result = await analyzeImageAction('not-a-url');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('nieprawidłowy');
      }
    });

    it('returns success with extracted data for valid image URL', async () => {
      const imageResult = { ...mockExtractedOffers, sourceType: 'photo' as const };
      mockAnalyzeImage.mockResolvedValue(imageResult);

      const result = await analyzeImageAction('https://storage.example.com/menu.jpg');

      expect(result).toEqual({ success: true, data: imageResult });
      expect(mockAnalyzeImage).toHaveBeenCalledWith('https://storage.example.com/menu.jpg');
    });

    it('trims image URL before processing', async () => {
      mockAnalyzeImage.mockResolvedValue({ ...mockExtractedOffers, sourceType: 'photo' });

      await analyzeImageAction('  https://storage.example.com/menu.jpg  ');

      expect(mockAnalyzeImage).toHaveBeenCalledWith('https://storage.example.com/menu.jpg');
    });

    it('returns error when AI service throws', async () => {
      mockAnalyzeImage.mockRejectedValue(new Error('AI service unavailable'));

      const result = await analyzeImageAction('https://storage.example.com/menu.jpg');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Nie udało się przeanalizować');
      }
    });
  });
});
