import { describe, it, expect } from 'vitest';
import { validateExtraction } from '@/lib/validations/extraction';
import type { ExtractedOffers } from '@/services/ai-analyzer';

describe('validateExtraction', () => {
  describe('empty extraction', () => {
    it('returns default missing fields when no offers are extracted', () => {
      const extraction: ExtractedOffers = {
        offers: [],
        sourceType: 'text',
        confidence: 0,
        missingFields: [],
      };

      const result = validateExtraction(extraction);

      expect(result.validOffers).toHaveLength(0);
      expect(result.partialOffers).toHaveLength(0);
      expect(result.missingFields).toEqual(['restaurantName', 'dishName', 'price']);
      expect(result.prefilledData).toHaveLength(0);
      expect(result.confidence).toBe(0);
      expect(result.sourceType).toBe('text');
    });
  });

  describe('fully valid offers', () => {
    it('categorizes a complete offer as valid', () => {
      const extraction: ExtractedOffers = {
        offers: [
          {
            restaurantName: 'Restauracja Polska',
            dishes: [
              { name: 'Pierogi', price: 25.0 },
            ],
            address: 'ul. Marszałkowska 1',
          },
        ],
        sourceType: 'link',
        confidence: 0.95,
        missingFields: [],
      };

      const result = validateExtraction(extraction);

      expect(result.validOffers).toHaveLength(1);
      expect(result.partialOffers).toHaveLength(0);
      expect(result.missingFields).toHaveLength(0);
      expect(result.prefilledData).toHaveLength(1);
      expect(result.confidence).toBe(0.95);
      expect(result.sourceType).toBe('link');
    });

    it('categorizes multiple complete offers as valid', () => {
      const extraction: ExtractedOffers = {
        offers: [
          {
            restaurantName: 'Restauracja A',
            dishes: [{ name: 'Zupa', price: 12.0 }],
          },
          {
            restaurantName: 'Restauracja B',
            dishes: [
              { name: 'Kotlet', price: 30.0 },
              { name: 'Sałatka', price: 18.0 },
            ],
          },
        ],
        sourceType: 'photo',
        confidence: 0.8,
        missingFields: [],
      };

      const result = validateExtraction(extraction);

      expect(result.validOffers).toHaveLength(2);
      expect(result.partialOffers).toHaveLength(0);
      expect(result.missingFields).toHaveLength(0);
    });
  });

  describe('partial offers — missing restaurant name', () => {
    it('detects missing restaurant name (null)', () => {
      const extraction: ExtractedOffers = {
        offers: [
          {
            restaurantName: null,
            dishes: [{ name: 'Pierogi', price: 25.0 }],
          },
        ],
        sourceType: 'text',
        confidence: 0.6,
        missingFields: [],
      };

      const result = validateExtraction(extraction);

      expect(result.validOffers).toHaveLength(0);
      expect(result.partialOffers).toHaveLength(1);
      expect(result.missingFields).toContain('restaurantName');
    });

    it('detects missing restaurant name (empty string)', () => {
      const extraction: ExtractedOffers = {
        offers: [
          {
            restaurantName: '   ',
            dishes: [{ name: 'Pierogi', price: 25.0 }],
          },
        ],
        sourceType: 'text',
        confidence: 0.6,
        missingFields: [],
      };

      const result = validateExtraction(extraction);

      expect(result.validOffers).toHaveLength(0);
      expect(result.partialOffers).toHaveLength(1);
      expect(result.missingFields).toContain('restaurantName');
    });
  });

  describe('partial offers — missing dish fields', () => {
    it('detects missing dish name', () => {
      const extraction: ExtractedOffers = {
        offers: [
          {
            restaurantName: 'Restauracja',
            dishes: [{ name: null, price: 25.0 }],
          },
        ],
        sourceType: 'text',
        confidence: 0.5,
        missingFields: [],
      };

      const result = validateExtraction(extraction);

      expect(result.validOffers).toHaveLength(0);
      expect(result.partialOffers).toHaveLength(1);
      expect(result.missingFields).toContain('dishName');
    });

    it('detects missing price (null)', () => {
      const extraction: ExtractedOffers = {
        offers: [
          {
            restaurantName: 'Restauracja',
            dishes: [{ name: 'Pierogi', price: null }],
          },
        ],
        sourceType: 'text',
        confidence: 0.5,
        missingFields: [],
      };

      const result = validateExtraction(extraction);

      expect(result.validOffers).toHaveLength(0);
      expect(result.partialOffers).toHaveLength(1);
      expect(result.missingFields).toContain('price');
    });

    it('detects invalid price (zero)', () => {
      const extraction: ExtractedOffers = {
        offers: [
          {
            restaurantName: 'Restauracja',
            dishes: [{ name: 'Pierogi', price: 0 }],
          },
        ],
        sourceType: 'text',
        confidence: 0.5,
        missingFields: [],
      };

      const result = validateExtraction(extraction);

      expect(result.validOffers).toHaveLength(0);
      expect(result.partialOffers).toHaveLength(1);
      expect(result.missingFields).toContain('price');
    });

    it('detects invalid price (negative)', () => {
      const extraction: ExtractedOffers = {
        offers: [
          {
            restaurantName: 'Restauracja',
            dishes: [{ name: 'Pierogi', price: -5 }],
          },
        ],
        sourceType: 'text',
        confidence: 0.5,
        missingFields: [],
      };

      const result = validateExtraction(extraction);

      expect(result.validOffers).toHaveLength(0);
      expect(result.partialOffers).toHaveLength(1);
      expect(result.missingFields).toContain('price');
    });

    it('detects missing dishes (empty array)', () => {
      const extraction: ExtractedOffers = {
        offers: [
          {
            restaurantName: 'Restauracja',
            dishes: [],
          },
        ],
        sourceType: 'text',
        confidence: 0.3,
        missingFields: [],
      };

      const result = validateExtraction(extraction);

      expect(result.validOffers).toHaveLength(0);
      expect(result.partialOffers).toHaveLength(1);
      expect(result.missingFields).toContain('dishName');
      expect(result.missingFields).toContain('price');
    });
  });

  describe('pre-filled data', () => {
    it('pre-fills successfully extracted fields', () => {
      const extraction: ExtractedOffers = {
        offers: [
          {
            restaurantName: 'Restauracja Polska',
            dishes: [
              {
                name: 'Pierogi',
                price: null,
                description: 'Z serem i ziemniakami',
                dietaryTags: ['vegetarian'],
                allergens: ['gluten', 'mleko'],
              },
            ],
            address: 'ul. Marszałkowska 1',
          },
        ],
        sourceType: 'link',
        confidence: 0.7,
        missingFields: [],
      };

      const result = validateExtraction(extraction);

      expect(result.prefilledData).toHaveLength(1);
      const prefilled = result.prefilledData[0];
      expect(prefilled.restaurantName).toBe('Restauracja Polska');
      expect(prefilled.address).toBe('ul. Marszałkowska 1');
      expect(prefilled.dishes[0].name).toBe('Pierogi');
      expect(prefilled.dishes[0].price).toBeNull();
      expect(prefilled.dishes[0].description).toBe('Z serem i ziemniakami');
      expect(prefilled.dishes[0].dietaryTags).toEqual(['vegetarian']);
      expect(prefilled.dishes[0].allergens).toEqual(['gluten', 'mleko']);
    });

    it('defaults optional fields when not provided', () => {
      const extraction: ExtractedOffers = {
        offers: [
          {
            restaurantName: 'Test',
            dishes: [{ name: 'Dish', price: 10 }],
          },
        ],
        sourceType: 'text',
        confidence: 0.9,
        missingFields: [],
      };

      const result = validateExtraction(extraction);

      const prefilled = result.prefilledData[0];
      expect(prefilled.address).toBe('');
      expect(prefilled.dishes[0].description).toBe('');
      expect(prefilled.dishes[0].dietaryTags).toEqual([]);
      expect(prefilled.dishes[0].allergens).toEqual([]);
    });
  });

  describe('mixed valid and partial offers', () => {
    it('separates valid and partial offers correctly', () => {
      const extraction: ExtractedOffers = {
        offers: [
          {
            restaurantName: 'Complete Restaurant',
            dishes: [{ name: 'Soup', price: 15.0 }],
          },
          {
            restaurantName: null,
            dishes: [{ name: 'Salad', price: 20.0 }],
          },
          {
            restaurantName: 'Another Restaurant',
            dishes: [{ name: null, price: 25.0 }],
          },
        ],
        sourceType: 'photo',
        confidence: 0.75,
        missingFields: [],
      };

      const result = validateExtraction(extraction);

      expect(result.validOffers).toHaveLength(1);
      expect(result.validOffers[0].restaurantName).toBe('Complete Restaurant');
      expect(result.partialOffers).toHaveLength(2);
      expect(result.prefilledData).toHaveLength(3);
    });
  });

  describe('multi-offer field prefixing', () => {
    it('uses indexed prefixes for multiple offers', () => {
      const extraction: ExtractedOffers = {
        offers: [
          {
            restaurantName: null,
            dishes: [{ name: 'Dish', price: 10 }],
          },
          {
            restaurantName: 'Restaurant',
            dishes: [{ name: null, price: null }],
          },
        ],
        sourceType: 'text',
        confidence: 0.5,
        missingFields: [],
      };

      const result = validateExtraction(extraction);

      expect(result.missingFields).toContain('offers[0].restaurantName');
      expect(result.missingFields).toContain('offers[1].dishName');
      expect(result.missingFields).toContain('offers[1].price');
    });

    it('uses dish-indexed prefixes for multiple dishes', () => {
      const extraction: ExtractedOffers = {
        offers: [
          {
            restaurantName: 'Restaurant',
            dishes: [
              { name: 'Dish A', price: 10 },
              { name: null, price: null },
            ],
          },
        ],
        sourceType: 'text',
        confidence: 0.5,
        missingFields: [],
      };

      const result = validateExtraction(extraction);

      expect(result.missingFields).toContain('dishes[1].dishName');
      expect(result.missingFields).toContain('dishes[1].price');
    });
  });

  describe('source type passthrough', () => {
    it.each(['link', 'text', 'photo'] as const)(
      'passes through sourceType "%s"',
      (sourceType) => {
        const extraction: ExtractedOffers = {
          offers: [
            {
              restaurantName: 'Test',
              dishes: [{ name: 'Dish', price: 10 }],
            },
          ],
          sourceType,
          confidence: 0.9,
          missingFields: [],
        };

        const result = validateExtraction(extraction);
        expect(result.sourceType).toBe(sourceType);
      }
    );
  });
});
