import { expect, it } from 'vitest';
import { formatLunchHours, normalizeLunchHours, parseLunchHours } from './lunch-hours-formatter';

it('displays database time values in HH:MM', () => {
  expect(formatLunchHours({ start: '12:00:00', end: '15:30:00' })).toBe('12:00 - 15:30');
  expect(parseLunchHours('12:00 - 15:30')).toEqual({ start: '12:00', end: '15:30' });
});
it('normalizes zero seconds while retaining nonzero seconds for validation', () => {
  expect(normalizeLunchHours({ start: '12:00:00', end: '15:30:00' })).toEqual({ start: '12:00', end: '15:30' });
  expect(normalizeLunchHours({ start: '12:00:20', end: 'invalid' })).toEqual({ start: '12:00:20', end: 'invalid' });
});
