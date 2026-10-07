import type { LunchHours } from '@/types/restaurants';

/**
 * Formats a LunchHours object into a display string.
 * @param hours - A valid LunchHours object with start and end in HH:MM format
 * @returns A formatted string like "12:00 - 16:00"
 */
export function formatLunchHours(hours: LunchHours): string {
  return `${hours.start.slice(0, 5)} - ${hours.end.slice(0, 5)}`;
}

/** Drop zero seconds from database time values without changing their time. */
export function normalizeLunchHours(hours: LunchHours): LunchHours {
  const normalize = (value: string) => /^\d{2}:\d{2}:00$/.test(value) ? value.slice(0, 5) : value;
  return { start: normalize(hours.start), end: normalize(hours.end) };
}

const LUNCH_HOURS_REGEX = /^(\d{2}:\d{2}) - (\d{2}:\d{2})$/;

/**
 * Parses a formatted lunch hours string back into a LunchHours object.
 * @param formatted - A string in the format "HH:MM - HH:MM"
 * @returns A LunchHours object, or null if the string doesn't match the expected format
 */
export function parseLunchHours(formatted: string): LunchHours | null {
  const match = formatted.match(LUNCH_HOURS_REGEX);
  if (!match) {
    return null;
  }

  const start = match[1];
  const end = match[2];

  return { start, end };
}
