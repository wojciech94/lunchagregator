import { afterEach, describe, expect, it, vi } from 'vitest';
import { importAvailableDateSchema } from './import-date';
afterEach(() => vi.useRealTimers());
describe('import publication UTC date window', () => {
  it('keeps today valid when local Warsaw time has already crossed midnight', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-08T23:30:00Z'));
    expect(importAvailableDateSchema.safeParse('2026-10-08').success).toBe(true);
    expect(importAvailableDateSchema.safeParse('2026-11-07').success).toBe(true);
    expect(importAvailableDateSchema.safeParse('2026-10-07').success).toBe(false);
    expect(importAvailableDateSchema.safeParse('2026-11-08').success).toBe(false);
  });
  it('rejects normalized nonexistent dates and timestamps', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-02-28T12:00:00Z'));
    expect(importAvailableDateSchema.safeParse('2026-02-30').success).toBe(false);
    expect(importAvailableDateSchema.safeParse('2026-03-01T00:00:00Z').success).toBe(false);
  });
});
