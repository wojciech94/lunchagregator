import { describe, it, expect } from 'vitest';
import { fc } from './fc-config';

describe('fast-check configuration smoke test', () => {
  it('should run with at least 100 iterations', () => {
    let runCount = 0;

    fc.assert(
      fc.property(fc.integer(), (n) => {
        runCount++;
        return typeof n === 'number';
      })
    );

    expect(runCount).toBeGreaterThanOrEqual(100);
  });
});
