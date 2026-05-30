import { describe, it, expect } from 'vitest';
import { offerFiltersSchema } from '@/lib/validations/filters';

describe('offerFiltersSchema', () => {
  it('accepts empty filters (all optional)', () => {
    const result = offerFiltersSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts valid distance filter', () => {
    const result = offerFiltersSchema.safeParse({
      distance: {
        radius: 5,
        from: { latitude: 52.2297, longitude: 21.0122 },
      },
    });
    expect(result.success).toBe(true);
  });

  describe('distance filter validation', () => {
    it('rejects radius below 0.5 km', () => {
      const result = offerFiltersSchema.safeParse({
        distance: {
          radius: 0.4,
          from: { latitude: 52.2297, longitude: 21.0122 },
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects radius above 25 km', () => {
      const result = offerFiltersSchema.safeParse({
        distance: {
          radius: 25.1,
          from: { latitude: 52.2297, longitude: 21.0122 },
        },
      });
      expect(result.success).toBe(false);
    });

    it('accepts radius of 0.5 km', () => {
      const result = offerFiltersSchema.safeParse({
        distance: {
          radius: 0.5,
          from: { latitude: 52.2297, longitude: 21.0122 },
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts radius of 25 km', () => {
      const result = offerFiltersSchema.safeParse({
        distance: {
          radius: 25,
          from: { latitude: 52.2297, longitude: 21.0122 },
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid latitude', () => {
      const result = offerFiltersSchema.safeParse({
        distance: {
          radius: 5,
          from: { latitude: 91, longitude: 21.0122 },
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid longitude', () => {
      const result = offerFiltersSchema.safeParse({
        distance: {
          radius: 5,
          from: { latitude: 52.2297, longitude: 181 },
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('price filter validation', () => {
    it('accepts valid price range', () => {
      const result = offerFiltersSchema.safeParse({
        price: { min: 10, max: 50 },
      });
      expect(result.success).toBe(true);
    });

    it('rejects min price below 0.01', () => {
      const result = offerFiltersSchema.safeParse({
        price: { min: 0, max: 50 },
      });
      expect(result.success).toBe(false);
    });

    it('rejects max price above 999.99', () => {
      const result = offerFiltersSchema.safeParse({
        price: { min: 10, max: 1000 },
      });
      expect(result.success).toBe(false);
    });

    it('rejects min greater than max', () => {
      const result = offerFiltersSchema.safeParse({
        price: { min: 50, max: 10 },
      });
      expect(result.success).toBe(false);
    });

    it('accepts min equal to max', () => {
      const result = offerFiltersSchema.safeParse({
        price: { min: 25, max: 25 },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('searchQuery validation', () => {
    it('rejects search query shorter than 2 characters', () => {
      const result = offerFiltersSchema.safeParse({
        searchQuery: 'a',
      });
      expect(result.success).toBe(false);
    });

    it('accepts search query of 2 characters', () => {
      const result = offerFiltersSchema.safeParse({
        searchQuery: 'ab',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('sortBy validation', () => {
    it('accepts valid sort options', () => {
      for (const sortBy of ['price_asc', 'price_desc', 'distance', 'newest']) {
        const result = offerFiltersSchema.safeParse({ sortBy });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid sort option', () => {
      const result = offerFiltersSchema.safeParse({ sortBy: 'invalid' });
      expect(result.success).toBe(false);
    });
  });

  describe('pagination validation', () => {
    it('defaults page to 1', () => {
      const result = offerFiltersSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
      }
    });

    it('defaults limit to 50', () => {
      const result = offerFiltersSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
      }
    });

    it('rejects limit above 50', () => {
      const result = offerFiltersSchema.safeParse({ limit: 51 });
      expect(result.success).toBe(false);
    });

    it('rejects page below 1', () => {
      const result = offerFiltersSchema.safeParse({ page: 0 });
      expect(result.success).toBe(false);
    });
  });

  describe('cuisineTypes validation', () => {
    it('accepts valid cuisine types', () => {
      const result = offerFiltersSchema.safeParse({
        cuisineTypes: ['polska', 'wloska'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid cuisine type', () => {
      const result = offerFiltersSchema.safeParse({
        cuisineTypes: ['invalid'],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('dietaryTags validation', () => {
    it('accepts valid dietary tags', () => {
      const result = offerFiltersSchema.safeParse({
        dietaryTags: ['vegetarian', 'vegan'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid dietary tag', () => {
      const result = offerFiltersSchema.safeParse({
        dietaryTags: ['invalid'],
      });
      expect(result.success).toBe(false);
    });
  });
});
