import { describe, it, expect } from 'vitest';
import {
  lunchHoursSchema,
  createRestaurantSchema,
  updateRestaurantSchema,
} from '@/schemas/restaurant.schema';

const validMinimalInput = {
  name: 'Restauracja Polska',
  address: 'ul. Marszałkowska 1, Warszawa',
  sessionToken: 'test-session-token-123',
};

const validFullInput = {
  name: 'Restauracja Polska',
  description: 'Tradycyjna kuchnia polska w centrum Warszawy',
  address: 'ul. Marszałkowska 1, Warszawa',
  location: { latitude: 52.2297, longitude: 21.0122 },
  priceLevel: 'średnia' as const,
  lunchHours: { start: '11:00', end: '15:00' },
  cuisineTypes: ['polska', 'srodziemnomorska'] as const,
  phoneNumber: '+48 22 123 45 67',
  websiteUrl: 'https://restauracja-polska.pl',
  sessionToken: 'test-session-token-123',
};

describe('lunchHoursSchema', () => {
  it('accepts valid lunch hours (12:00-16:00)', () => {
    const result = lunchHoursSchema.safeParse({ start: '12:00', end: '16:00' });
    expect(result.success).toBe(true);
  });

  it('accepts boundary start time (06:00)', () => {
    const result = lunchHoursSchema.safeParse({ start: '06:00', end: '07:00' });
    expect(result.success).toBe(true);
  });

  it('accepts boundary end time (23:00)', () => {
    const result = lunchHoursSchema.safeParse({ start: '18:00', end: '23:00' });
    expect(result.success).toBe(true);
  });

  it('rejects when start >= end (same time)', () => {
    const result = lunchHoursSchema.safeParse({ start: '12:00', end: '12:00' });
    expect(result.success).toBe(false);
  });

  it('rejects when start > end', () => {
    const result = lunchHoursSchema.safeParse({ start: '16:00', end: '12:00' });
    expect(result.success).toBe(false);
  });

  it('rejects start out of range (05:00 < 06:00)', () => {
    const result = lunchHoursSchema.safeParse({ start: '05:00', end: '12:00' });
    expect(result.success).toBe(false);
  });

  it('rejects start out of range (19:00 > 18:00)', () => {
    const result = lunchHoursSchema.safeParse({ start: '19:00', end: '22:00' });
    expect(result.success).toBe(false);
  });

  it('rejects end out of range (06:00 < 07:00)', () => {
    const result = lunchHoursSchema.safeParse({ start: '06:00', end: '06:30' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid time format', () => {
    const result = lunchHoursSchema.safeParse({ start: '9:00', end: '15:00' });
    expect(result.success).toBe(false);
  });

  it('rejects non-time strings', () => {
    const result = lunchHoursSchema.safeParse({ start: 'abc', end: 'def' });
    expect(result.success).toBe(false);
  });
});

describe('createRestaurantSchema', () => {
  it('accepts valid minimal input (name + address + sessionToken)', () => {
    const result = createRestaurantSchema.safeParse(validMinimalInput);
    expect(result.success).toBe(true);
  });

  it('accepts valid full input (all fields populated)', () => {
    const result = createRestaurantSchema.safeParse(validFullInput);
    expect(result.success).toBe(true);
  });

  it('accepts input with location instead of address', () => {
    const result = createRestaurantSchema.safeParse({
      name: 'Test Restaurant',
      location: { latitude: 52.2297, longitude: 21.0122 },
      sessionToken: 'token-123',
    });
    expect(result.success).toBe(true);
  });

  describe('name validation', () => {
    it('rejects name too short (1 char)', () => {
      const result = createRestaurantSchema.safeParse({
        ...validMinimalInput,
        name: 'A',
      });
      expect(result.success).toBe(false);
    });

    it('accepts name of exactly 2 characters', () => {
      const result = createRestaurantSchema.safeParse({
        ...validMinimalInput,
        name: 'AB',
      });
      expect(result.success).toBe(true);
    });

    it('rejects name too long (101 chars)', () => {
      const result = createRestaurantSchema.safeParse({
        ...validMinimalInput,
        name: 'a'.repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it('accepts name of exactly 100 characters', () => {
      const result = createRestaurantSchema.safeParse({
        ...validMinimalInput,
        name: 'a'.repeat(100),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('address/location requirement', () => {
    it('rejects when both address and location are missing', () => {
      const result = createRestaurantSchema.safeParse({
        name: 'Test Restaurant',
        sessionToken: 'token-123',
      });
      expect(result.success).toBe(false);
    });

    it('accepts when only address is provided', () => {
      const result = createRestaurantSchema.safeParse({
        name: 'Test Restaurant',
        address: 'ul. Testowa 1',
        sessionToken: 'token-123',
      });
      expect(result.success).toBe(true);
    });

    it('accepts when only location is provided', () => {
      const result = createRestaurantSchema.safeParse({
        name: 'Test Restaurant',
        location: { latitude: 50.0, longitude: 20.0 },
        sessionToken: 'token-123',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('description validation', () => {
    it('rejects description too long (501 chars)', () => {
      const result = createRestaurantSchema.safeParse({
        ...validMinimalInput,
        description: 'a'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('accepts description of exactly 500 characters', () => {
      const result = createRestaurantSchema.safeParse({
        ...validMinimalInput,
        description: 'a'.repeat(500),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('websiteUrl validation', () => {
    it('rejects invalid URL format', () => {
      const result = createRestaurantSchema.safeParse({
        ...validMinimalInput,
        websiteUrl: 'not-a-valid-url',
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid URL', () => {
      const result = createRestaurantSchema.safeParse({
        ...validMinimalInput,
        websiteUrl: 'https://example.com',
      });
      expect(result.success).toBe(true);
    });

    it('rejects URL over 500 characters', () => {
      const result = createRestaurantSchema.safeParse({
        ...validMinimalInput,
        websiteUrl: 'https://example.com/' + 'a'.repeat(481),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('phoneNumber validation', () => {
    it('rejects phone too long (21 chars)', () => {
      const result = createRestaurantSchema.safeParse({
        ...validMinimalInput,
        phoneNumber: '1'.repeat(21),
      });
      expect(result.success).toBe(false);
    });

    it('accepts phone of exactly 20 characters', () => {
      const result = createRestaurantSchema.safeParse({
        ...validMinimalInput,
        phoneNumber: '1'.repeat(20),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('sessionToken validation', () => {
    it('rejects empty sessionToken', () => {
      const result = createRestaurantSchema.safeParse({
        ...validMinimalInput,
        sessionToken: '',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('updateRestaurantSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    const result = updateRestaurantSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts partial update with only name', () => {
    const result = updateRestaurantSchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('accepts nullable fields (can set description to null to clear)', () => {
    const result = updateRestaurantSchema.safeParse({ description: null });
    expect(result.success).toBe(true);
  });

  it('accepts nullable phoneNumber (set to null to clear)', () => {
    const result = updateRestaurantSchema.safeParse({ phoneNumber: null });
    expect(result.success).toBe(true);
  });

  it('accepts nullable websiteUrl (set to null to clear)', () => {
    const result = updateRestaurantSchema.safeParse({ websiteUrl: null });
    expect(result.success).toBe(true);
  });

  it('accepts nullable lunchHours (set to null to clear)', () => {
    const result = updateRestaurantSchema.safeParse({ lunchHours: null });
    expect(result.success).toBe(true);
  });

  it('accepts nullable priceLevel (set to null to clear)', () => {
    const result = updateRestaurantSchema.safeParse({ priceLevel: null });
    expect(result.success).toBe(true);
  });

  it('accepts nullable location (set to null to clear)', () => {
    const result = updateRestaurantSchema.safeParse({ location: null });
    expect(result.success).toBe(true);
  });

  it('enforces same name constraints as create schema', () => {
    const result = updateRestaurantSchema.safeParse({ name: 'A' });
    expect(result.success).toBe(false);
  });

  it('enforces same description max length', () => {
    const result = updateRestaurantSchema.safeParse({
      description: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('enforces same websiteUrl format validation', () => {
    const result = updateRestaurantSchema.safeParse({
      websiteUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('enforces same phoneNumber max length', () => {
    const result = updateRestaurantSchema.safeParse({
      phoneNumber: '1'.repeat(21),
    });
    expect(result.success).toBe(false);
  });
});
