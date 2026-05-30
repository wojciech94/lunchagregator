import { describe, it, expect } from 'vitest';
import { formatLunchHours, parseLunchHours } from '@/utils/lunch-hours-formatter';
import type { LunchHours } from '@/types/restaurants';

describe('formatLunchHours', () => {
  it('formats lunch hours as "HH:MM - HH:MM"', () => {
    const hours: LunchHours = { start: '12:00', end: '16:00' };
    expect(formatLunchHours(hours)).toBe('12:00 - 16:00');
  });

  it('formats early morning boundary (06:00)', () => {
    const hours: LunchHours = { start: '06:00', end: '14:00' };
    expect(formatLunchHours(hours)).toBe('06:00 - 14:00');
  });

  it('formats late evening boundary (23:00)', () => {
    const hours: LunchHours = { start: '11:00', end: '23:00' };
    expect(formatLunchHours(hours)).toBe('11:00 - 23:00');
  });

  it('formats both boundaries (06:00 - 23:00)', () => {
    const hours: LunchHours = { start: '06:00', end: '23:00' };
    expect(formatLunchHours(hours)).toBe('06:00 - 23:00');
  });

  it('formats hours with non-zero minutes', () => {
    const hours: LunchHours = { start: '11:30', end: '14:45' };
    expect(formatLunchHours(hours)).toBe('11:30 - 14:45');
  });

  it('formats consecutive hours', () => {
    const hours: LunchHours = { start: '12:00', end: '13:00' };
    expect(formatLunchHours(hours)).toBe('12:00 - 13:00');
  });
});

describe('parseLunchHours', () => {
  it('parses a valid formatted string', () => {
    expect(parseLunchHours('12:00 - 16:00')).toEqual({ start: '12:00', end: '16:00' });
  });

  it('parses hours with non-zero minutes', () => {
    expect(parseLunchHours('11:30 - 14:45')).toEqual({ start: '11:30', end: '14:45' });
  });

  it('parses boundary times (06:00 - 23:00)', () => {
    expect(parseLunchHours('06:00 - 23:00')).toEqual({ start: '06:00', end: '23:00' });
  });

  it('returns null for empty string', () => {
    expect(parseLunchHours('')).toBeNull();
  });

  it('returns null for invalid format (no spaces around dash)', () => {
    expect(parseLunchHours('12:00-16:00')).toBeNull();
  });

  it('returns null for wrong separator (en-dash)', () => {
    expect(parseLunchHours('12:00 – 16:00')).toBeNull();
  });

  it('returns null for wrong separator (slash)', () => {
    expect(parseLunchHours('12:00 / 16:00')).toBeNull();
  });

  it('returns null for wrong separator (to)', () => {
    expect(parseLunchHours('12:00 to 16:00')).toBeNull();
  });

  it('returns null for partial input (missing end time)', () => {
    expect(parseLunchHours('12:00 - ')).toBeNull();
  });

  it('returns null for partial input (missing start time)', () => {
    expect(parseLunchHours(' - 16:00')).toBeNull();
  });

  it('returns null for single time value', () => {
    expect(parseLunchHours('12:00')).toBeNull();
  });

  it('returns null for random text', () => {
    expect(parseLunchHours('lunch time')).toBeNull();
  });

  it('returns null for extra whitespace', () => {
    expect(parseLunchHours('12:00  -  16:00')).toBeNull();
  });

  it('returns null for leading/trailing whitespace', () => {
    expect(parseLunchHours(' 12:00 - 16:00 ')).toBeNull();
  });
});

describe('round-trip: format then parse returns original', () => {
  it('round-trip with typical lunch hours', () => {
    const hours: LunchHours = { start: '12:00', end: '16:00' };
    expect(parseLunchHours(formatLunchHours(hours))).toEqual(hours);
  });

  it('round-trip with boundary values (06:00 - 23:00)', () => {
    const hours: LunchHours = { start: '06:00', end: '23:00' };
    expect(parseLunchHours(formatLunchHours(hours))).toEqual(hours);
  });

  it('round-trip with non-zero minutes', () => {
    const hours: LunchHours = { start: '11:30', end: '14:45' };
    expect(parseLunchHours(formatLunchHours(hours))).toEqual(hours);
  });

  it('round-trip with consecutive hours', () => {
    const hours: LunchHours = { start: '18:00', end: '19:00' };
    expect(parseLunchHours(formatLunchHours(hours))).toEqual(hours);
  });
});
