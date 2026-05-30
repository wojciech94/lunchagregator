// Feature: restaurant-management, Property 2: Lunch hours validation — time format and ordering

import { describe, it, expect } from 'vitest';
import { fc } from './fc-config';
import { lunchHoursSchema } from '@/schemas/restaurant.schema';

/**
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4
 *
 * Property 2: Lunch hours validation — time format and ordering
 * For any pair of time strings, the lunch hours validation function SHALL:
 * (a) accept pairs where both are valid HH:MM format, start is in range 06:00-18:00,
 *     end is in range 07:00-23:00, and start < end
 * (b) reject all other pairs with an appropriate error message
 */

// --- Helpers ---

/** Pad a number to 2 digits */
function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Generate a valid HH:MM time string from hour and minute */
function toTimeStr(h: number, m: number): string {
  return `${pad(h)}:${pad(m)}`;
}

// --- Generators ---

/** Generate a valid start time: hour 06-18, minute 00-59 */
const validStartHourArb = fc.integer({ min: 6, max: 18 });
const validEndHourArb = fc.integer({ min: 7, max: 23 });
const validMinuteArb = fc.integer({ min: 0, max: 59 });

/** Generate a valid time pair where start < end */
const validTimePairArb = fc
  .tuple(validStartHourArb, validMinuteArb, validEndHourArb, validMinuteArb)
  .filter(([startH, startM, endH, endM]) => {
    const start = toTimeStr(startH, startM);
    const end = toTimeStr(endH, endM);
    return start < end;
  })
  .map(([startH, startM, endH, endM]) => ({
    start: toTimeStr(startH, startM),
    end: toTimeStr(endH, endM),
  }));

/** Generate an invalid time format string (not matching HH:MM pattern) */
const invalidTimeFormatArb = fc.oneof(
  // Missing colon
  fc.string({ minLength: 1, maxLength: 5 }).filter((s) => !/^([01]\d|2[0-3]):([0-5]\d)$/.test(s)),
  // Single digit hour
  fc.tuple(fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 59 })).map(([h, m]) => `${h}:${pad(m)}`),
  // Invalid hour (24+)
  fc.tuple(fc.integer({ min: 24, max: 99 }), fc.integer({ min: 0, max: 59 })).map(([h, m]) => `${pad(h)}:${pad(m)}`),
  // Invalid minute (60+)
  fc.tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 60, max: 99 })).map(([h, m]) => `${pad(h)}:${pad(m)}`),
  // Random garbage
  fc.constantFrom('abc', '25:00', '12:60', '1:30', '12:5', '', '12-00', '12:00:00')
);

/** Generate a pair where start >= end (both valid format and in range) */
const startGteEndPairArb = fc
  .tuple(validStartHourArb, validMinuteArb, validEndHourArb, validMinuteArb)
  .filter(([startH, startM, endH, endM]) => {
    const start = toTimeStr(startH, startM);
    const end = toTimeStr(endH, endM);
    return start >= end;
  })
  .map(([startH, startM, endH, endM]) => ({
    start: toTimeStr(startH, startM),
    end: toTimeStr(endH, endM),
  }));

/** Generate start time outside 06:00-18:00 range (but valid HH:MM format) */
const outOfRangeStartHourArb = fc.oneof(
  fc.integer({ min: 0, max: 5 }),
  fc.integer({ min: 19, max: 23 })
);

/** Generate end time outside 07:00-23:00 range (but valid HH:MM format) */
const outOfRangeEndHourArb = fc.integer({ min: 0, max: 6 });

describe('Property 2: Lunch hours validation — time format and ordering', () => {
  describe('(a) accept valid time pairs', () => {
    it('should accept pairs where both are valid HH:MM, start in 06:00-18:00, end in 07:00-23:00, and start < end', () => {
      fc.assert(
        fc.property(validTimePairArb, (pair) => {
          const result = lunchHoursSchema.safeParse(pair);
          expect(result.success).toBe(true);
        })
      );
    });
  });

  describe('(b) reject invalid time pairs', () => {
    it('should reject pairs with invalid time format', () => {
      fc.assert(
        fc.property(invalidTimeFormatArb, validMinuteArb, validEndHourArb, validMinuteArb, (invalidStart, _m, endH, endM) => {
          const pair = { start: invalidStart, end: toTimeStr(endH, endM) };
          const result = lunchHoursSchema.safeParse(pair);
          expect(result.success).toBe(false);
        })
      );
    });

    it('should reject pairs with invalid end time format', () => {
      fc.assert(
        fc.property(validStartHourArb, validMinuteArb, invalidTimeFormatArb, (startH, startM, invalidEnd) => {
          const pair = { start: toTimeStr(startH, startM), end: invalidEnd };
          const result = lunchHoursSchema.safeParse(pair);
          expect(result.success).toBe(false);
        })
      );
    });

    it('should reject pairs where start >= end', () => {
      fc.assert(
        fc.property(startGteEndPairArb, (pair) => {
          const result = lunchHoursSchema.safeParse(pair);
          expect(result.success).toBe(false);
        })
      );
    });

    it('should reject pairs where start time is outside 06:00-18:00 range', () => {
      fc.assert(
        fc.property(
          outOfRangeStartHourArb,
          validMinuteArb,
          validEndHourArb,
          validMinuteArb,
          (startH, startM, endH, endM) => {
            const start = toTimeStr(startH, startM);
            const end = toTimeStr(endH, endM);
            // Only test when format is valid (it always will be) and start < end
            // to isolate the range rejection
            if (start < end) {
              const result = lunchHoursSchema.safeParse({ start, end });
              expect(result.success).toBe(false);
            }
          }
        )
      );
    });

    it('should reject pairs where end time is outside 07:00-23:00 range', () => {
      fc.assert(
        fc.property(
          validStartHourArb,
          validMinuteArb,
          outOfRangeEndHourArb,
          validMinuteArb,
          (startH, startM, endH, endM) => {
            const start = toTimeStr(startH, startM);
            const end = toTimeStr(endH, endM);
            // Only test when start < end to isolate the range rejection
            if (start < end) {
              const result = lunchHoursSchema.safeParse({ start, end });
              expect(result.success).toBe(false);
            }
          }
        )
      );
    });
  });
});

// Feature: restaurant-management, Property 3: Lunch hours display format round-trip

import { formatLunchHours, parseLunchHours } from '@/utils/lunch-hours-formatter';

/**
 * Validates: Requirements 7.5
 *
 * Property 3: Lunch hours display format (round-trip)
 * For any valid LunchHours object (start and end in HH:MM format), the display formatter
 * SHALL produce a string in the format "HH:MM - HH:MM", and parsing that string back
 * SHALL produce the original LunchHours object.
 */

describe('Property 3: Lunch hours display format round-trip', () => {
  /** Pad a number to 2 digits */
  function pad2(n: number): string {
    return n.toString().padStart(2, '0');
  }

  /** Generate a valid LunchHours object: start 06:00-18:00, end 07:00-23:00, start < end */
  const validLunchHoursArb = fc
    .tuple(
      fc.integer({ min: 6, max: 18 }),
      fc.integer({ min: 0, max: 59 }),
      fc.integer({ min: 7, max: 23 }),
      fc.integer({ min: 0, max: 59 })
    )
    .filter(([startH, startM, endH, endM]) => {
      const start = `${pad2(startH)}:${pad2(startM)}`;
      const end = `${pad2(endH)}:${pad2(endM)}`;
      return start < end;
    })
    .map(([startH, startM, endH, endM]) => ({
      start: `${pad2(startH)}:${pad2(startM)}`,
      end: `${pad2(endH)}:${pad2(endM)}`,
    }));

  const DISPLAY_FORMAT_REGEX = /^\d{2}:\d{2} - \d{2}:\d{2}$/;

  it('formatLunchHours should produce a string matching "HH:MM - HH:MM" pattern', () => {
    fc.assert(
      fc.property(validLunchHoursArb, (hours) => {
        const formatted = formatLunchHours(hours);
        expect(formatted).toMatch(DISPLAY_FORMAT_REGEX);
      }),
      { numRuns: 100 }
    );
  });

  it('parseLunchHours(formatLunchHours(hours)) should return the original LunchHours object', () => {
    fc.assert(
      fc.property(validLunchHoursArb, (hours) => {
        const formatted = formatLunchHours(hours);
        const parsed = parseLunchHours(formatted);
        expect(parsed).not.toBeNull();
        expect(parsed).toEqual(hours);
      }),
      { numRuns: 100 }
    );
  });
});
