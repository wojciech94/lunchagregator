import { describe, it, expect } from 'vitest';
import { createOfferSchema, updateOfferSchema } from '@/lib/validations/offer';

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function futureDateISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function pastDateISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

const validOffer = {
  dishName: 'Pierogi ruskie',
  price: 25.0,
  restaurantName: 'Restauracja Polska',
  availableDate: todayISO(),
  sourceType: 'text' as const,
};

describe('createOfferSchema', () => {
  it('accepts a valid minimal offer', () => {
    const result = createOfferSchema.safeParse(validOffer);
    expect(result.success).toBe(true);
  });

  it('accepts a valid offer with all optional fields', () => {
    const result = createOfferSchema.safeParse({
      ...validOffer,
      description: 'Pyszne pierogi z serem i ziemniakami',
      cuisineType: 'polska',
      dietaryTags: ['vegetarian'],
      allergens: ['gluten', 'mleko'],
      restaurantAddress: 'ul. Marszałkowska 1, Warszawa',
    });
    expect(result.success).toBe(true);
  });

  describe('dishName validation', () => {
    it('rejects empty dish name', () => {
      const result = createOfferSchema.safeParse({ ...validOffer, dishName: '' });
      expect(result.success).toBe(false);
    });

    it('rejects dish name over 100 characters', () => {
      const result = createOfferSchema.safeParse({
        ...validOffer,
        dishName: 'a'.repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it('accepts dish name of exactly 100 characters', () => {
      const result = createOfferSchema.safeParse({
        ...validOffer,
        dishName: 'a'.repeat(100),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('price validation', () => {
    it('rejects price below 0.01', () => {
      const result = createOfferSchema.safeParse({ ...validOffer, price: 0 });
      expect(result.success).toBe(false);
    });

    it('rejects price above 9999.99', () => {
      const result = createOfferSchema.safeParse({ ...validOffer, price: 10000 });
      expect(result.success).toBe(false);
    });

    it('accepts price of 0.01', () => {
      const result = createOfferSchema.safeParse({ ...validOffer, price: 0.01 });
      expect(result.success).toBe(true);
    });

    it('accepts price of 9999.99', () => {
      const result = createOfferSchema.safeParse({ ...validOffer, price: 9999.99 });
      expect(result.success).toBe(true);
    });
  });

  describe('restaurantName validation', () => {
    it('rejects empty restaurant name', () => {
      const result = createOfferSchema.safeParse({ ...validOffer, restaurantName: '' });
      expect(result.success).toBe(false);
    });

    it('rejects restaurant name over 100 characters', () => {
      const result = createOfferSchema.safeParse({
        ...validOffer,
        restaurantName: 'a'.repeat(101),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('availableDate validation', () => {
    it('accepts today', () => {
      const result = createOfferSchema.safeParse({
        ...validOffer,
        availableDate: todayISO(),
      });
      expect(result.success).toBe(true);
    });

    it('accepts a date 30 days in the future', () => {
      const result = createOfferSchema.safeParse({
        ...validOffer,
        availableDate: futureDateISO(30),
      });
      expect(result.success).toBe(true);
    });

    it('rejects a date 31 days in the future', () => {
      const result = createOfferSchema.safeParse({
        ...validOffer,
        availableDate: futureDateISO(31),
      });
      expect(result.success).toBe(false);
    });

    it('rejects a past date', () => {
      const result = createOfferSchema.safeParse({
        ...validOffer,
        availableDate: pastDateISO(1),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('optional field constraints', () => {
    it('rejects description over 500 characters', () => {
      const result = createOfferSchema.safeParse({
        ...validOffer,
        description: 'a'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('accepts description of exactly 500 characters', () => {
      const result = createOfferSchema.safeParse({
        ...validOffer,
        description: 'a'.repeat(500),
      });
      expect(result.success).toBe(true);
    });

    it('rejects more than 5 dietary tags', () => {
      const result = createOfferSchema.safeParse({
        ...validOffer,
        dietaryTags: ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'keto', 'vegetarian'],
      });
      expect(result.success).toBe(false);
    });

    it('accepts exactly 5 dietary tags', () => {
      const result = createOfferSchema.safeParse({
        ...validOffer,
        dietaryTags: ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'keto'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects more than 10 allergens', () => {
      const result = createOfferSchema.safeParse({
        ...validOffer,
        allergens: [
          'gluten', 'orzechy', 'mleko', 'jaja', 'ryby',
          'skorupiaki', 'soja', 'seler', 'gorczyca', 'sezam', 'gluten',
        ],
      });
      expect(result.success).toBe(false);
    });

    it('accepts exactly 10 allergens', () => {
      const result = createOfferSchema.safeParse({
        ...validOffer,
        allergens: [
          'gluten', 'orzechy', 'mleko', 'jaja', 'ryby',
          'skorupiaki', 'soja', 'seler', 'gorczyca', 'sezam',
        ],
      });
      expect(result.success).toBe(true);
    });

    it('rejects restaurant address over 200 characters', () => {
      const result = createOfferSchema.safeParse({
        ...validOffer,
        restaurantAddress: 'a'.repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it('accepts restaurant address of exactly 200 characters', () => {
      const result = createOfferSchema.safeParse({
        ...validOffer,
        restaurantAddress: 'a'.repeat(200),
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid cuisine type', () => {
      const result = createOfferSchema.safeParse({
        ...validOffer,
        cuisineType: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid dietary tag', () => {
      const result = createOfferSchema.safeParse({
        ...validOffer,
        dietaryTags: ['invalid-tag'],
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid allergen', () => {
      const result = createOfferSchema.safeParse({
        ...validOffer,
        allergens: ['invalid-allergen'],
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('updateOfferSchema', () => {
  it('accepts partial update with only dishName', () => {
    const result = updateOfferSchema.safeParse({ dishName: 'New name' });
    expect(result.success).toBe(true);
  });

  it('accepts partial update with only price', () => {
    const result = updateOfferSchema.safeParse({ price: 30.0 });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (no fields to update)', () => {
    const result = updateOfferSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('enforces same constraints as create schema on provided fields', () => {
    const result = updateOfferSchema.safeParse({
      dishName: 'a'.repeat(101),
    });
    expect(result.success).toBe(false);
  });
});
