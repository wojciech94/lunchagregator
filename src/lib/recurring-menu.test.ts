import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { menuContentSchema, menuDates, menuForDate, menuToday, nextMenuMonday } from './recurring-menu';

const dish = { id: '11111111-1111-4111-8111-111111111111', dishName: 'Lunch', price: 25, sourceType: 'text', days: [1] };
describe('recurring menu calendar and preview', () => {
  it('uses Warsaw at midnight and across daylight-saving boundaries', () => {
    expect(menuToday(new Date('2026-10-09T22:30:00Z'))).toBe('2026-10-10');
    expect(menuToday(new Date('2026-03-29T22:30:00Z'))).toBe('2026-03-30');
    expect(menuToday(new Date('2026-10-25T22:30:00Z'))).toBe('2026-10-25');
  });
  it('shows next Monday and applies a scheduled revision without changing earlier dates', () => {
    const first = menuContentSchema.parse({ kind: 'fixed', entries: [dish] });
    const revised = { ...first, entries: first.entries.map(d => ({ ...d, price: 30 })) };
    expect(menuDates('2026-10-05', 14)).toContain('2026-10-12');
    expect(nextMenuMonday('2026-10-05')).toBe('2026-10-12');
    expect(nextMenuMonday('2026-10-09')).toBe('2026-10-12');
    const revisions = [{ effectiveFrom: '2026-10-05', content: first }, { effectiveFrom: '2026-10-12', content: revised }];
    expect(menuForDate(revisions, '2026-10-05')[0].price).toBe(25);
    expect(menuForDate(revisions, '2026-10-12')[0].price).toBe(30);
    expect(menuForDate(revisions, '2026-10-13')).toEqual([]);
  });
  it('generates bounded contiguous date horizons with no duplicates', () => {
    fc.assert(fc.property(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-01'), noInvalidDate: true }), date => {
      const from = date.toISOString().slice(0,10); const days = menuDates(from);
      expect(days).toHaveLength(30); expect(new Set(days).size).toBe(30); expect(days[0]).toBe(from);
      for (let i=1;i<days.length;i++) expect((Date.parse(days[i]) - Date.parse(days[i-1])) / 86400000).toBe(1);
    }));
  });
  it('rejects ambiguous fixed schedules, duplicate entry IDs and empty days', () => {
    expect(menuContentSchema.safeParse({ kind: 'fixed', entries: [dish, { ...dish, id: '22222222-2222-4222-8222-222222222222', days: [2] }] }).success).toBe(false);
    expect(menuContentSchema.safeParse({ kind: 'weekday', entries: [dish,dish] }).success).toBe(false);
    expect(menuContentSchema.safeParse({ kind: 'weekday', entries: [{ ...dish, days: [] }] }).success).toBe(false);
  });
});
