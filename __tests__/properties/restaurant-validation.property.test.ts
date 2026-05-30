// Feature: restaurant-management, Property 1: Restaurant validation — required and optional field constraints

import { describe, it, expect } from 'vitest';
import { fc } from './fc-config';
import { createRestaurantSchema } from '@/schemas/restaurant.schema';

/**
 * Validates: Requirements 1.2, 1.3, 1.7
 *
 * Property 1: Restaurant validation — required and optional field constraints
 * For any restaurant creation input, the validation function SHALL:
 * (a) reject inputs where name has fewer than 2 or more than 100 characters,
 *     or where neither address nor location is provided
 * (b) reject inputs where optional description exceeds 500 characters,
 *     phone_number exceeds 20 characters, or website_url exceeds 500 characters
 * (c) accept all inputs satisfying these constraints
 */

// --- Generators ---

const validNameArb = fc.string({ minLength: 2, maxLength: 100 }).filter((s) => s.trim().length >= 2);

const validAddressArb = fc.string({ minLength: 1, maxLength: 200 });

const validLocationArb = fc.record({
  latitude: fc.double({ min: -90, max: 90, noNaN: true }),
  longitude: fc.double({ min: -180, max: 180, noNaN: true }),
});

const validDescriptionArb = fc.string({ minLength: 0, maxLength: 500 });

const validPhoneNumberArb = fc.string({ minLength: 1, maxLength: 20 });

const validWebsiteUrlArb = fc.constantFrom(
  'https://example.com',
  'https://restaurant.pl',
  'https://food.io/menu',
  'https://a.co',
  'https://my-restaurant.com/about'
);

const sessionTokenArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.length >= 1);

// Generator for valid inputs that should pass validation
const validInputArb = fc
  .record({
    name: validNameArb,
    description: fc.option(validDescriptionArb, { nil: undefined }),
    address: fc.option(validAddressArb, { nil: undefined }),
    location: fc.option(validLocationArb, { nil: undefined }),
    phoneNumber: fc.option(validPhoneNumberArb, { nil: undefined }),
    websiteUrl: fc.option(validWebsiteUrlArb, { nil: undefined }),
    sessionToken: sessionTokenArb,
  })
  .filter((input) => input.address !== undefined || input.location !== undefined);

describe('Property 1: Restaurant validation — required and optional field constraints', () => {
  describe('(c) accept all inputs satisfying constraints', () => {
    it('should accept valid inputs with address or location, name 2-100 chars, and optional fields within limits', () => {
      fc.assert(
        fc.property(validInputArb, (input) => {
          const result = createRestaurantSchema.safeParse(input);
          expect(result.success).toBe(true);
        })
      );
    });
  });

  describe('(a) reject inputs with invalid name or missing both address and location', () => {
    it('should reject inputs where name has fewer than 2 characters', () => {
      const shortNameArb = fc.string({ minLength: 0, maxLength: 1 });

      fc.assert(
        fc.property(shortNameArb, validAddressArb, sessionTokenArb, (name, address, sessionToken) => {
          const input = { name, address, sessionToken };
          const result = createRestaurantSchema.safeParse(input);
          expect(result.success).toBe(false);
        })
      );
    });

    it('should reject inputs where name has more than 100 characters', () => {
      const longNameArb = fc.string({ minLength: 101, maxLength: 200 });

      fc.assert(
        fc.property(longNameArb, validAddressArb, sessionTokenArb, (name, address, sessionToken) => {
          const input = { name, address, sessionToken };
          const result = createRestaurantSchema.safeParse(input);
          expect(result.success).toBe(false);
        })
      );
    });

    it('should reject inputs where neither address nor location is provided', () => {
      fc.assert(
        fc.property(validNameArb, sessionTokenArb, (name, sessionToken) => {
          const input = { name, sessionToken };
          const result = createRestaurantSchema.safeParse(input);
          expect(result.success).toBe(false);
        })
      );
    });
  });

  describe('(b) reject inputs with oversized optional fields', () => {
    it('should reject inputs where description exceeds 500 characters', () => {
      const longDescriptionArb = fc.string({ minLength: 501, maxLength: 600 });

      fc.assert(
        fc.property(
          validNameArb,
          longDescriptionArb,
          validAddressArb,
          sessionTokenArb,
          (name, description, address, sessionToken) => {
            const input = { name, description, address, sessionToken };
            const result = createRestaurantSchema.safeParse(input);
            expect(result.success).toBe(false);
          }
        )
      );
    });

    it('should reject inputs where phone_number exceeds 20 characters', () => {
      const longPhoneArb = fc.string({ minLength: 21, maxLength: 50 });

      fc.assert(
        fc.property(
          validNameArb,
          longPhoneArb,
          validAddressArb,
          sessionTokenArb,
          (name, phoneNumber, address, sessionToken) => {
            const input = { name, phoneNumber, address, sessionToken };
            const result = createRestaurantSchema.safeParse(input);
            expect(result.success).toBe(false);
          }
        )
      );
    });

    it('should reject inputs where website_url exceeds 500 characters', () => {
      // Generate a valid URL prefix followed by enough characters to exceed 500
      const longUrlArb = fc
        .string({ minLength: 490, maxLength: 600 })
        .map((s) => `https://example.com/${s}`);

      fc.assert(
        fc.property(
          validNameArb,
          longUrlArb,
          validAddressArb,
          sessionTokenArb,
          (name, websiteUrl, address, sessionToken) => {
            const input = { name, websiteUrl, address, sessionToken };
            const result = createRestaurantSchema.safeParse(input);
            expect(result.success).toBe(false);
          }
        )
      );
    });
  });
});
