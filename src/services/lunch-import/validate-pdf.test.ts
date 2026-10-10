import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ worker: vi.fn() }));
vi.mock('node:worker_threads', () => ({ Worker: class { constructor(...args: unknown[]) { return mocks.worker(...args); } } }));
import { validateMenuPdf } from './validate-pdf';
afterEach(() => vi.useRealTimers());
describe('PDF validation worker deadline', () => {
  it('terminates a stalled parser at five seconds with a bounded worker heap', async () => {
    vi.useFakeTimers();
    const worker = Object.assign(new EventEmitter(), { terminate: vi.fn().mockResolvedValue(0) });
    mocks.worker.mockReturnValue(worker);
    const pending = expect(validateMenuPdf(Buffer.from('%PDF-1.7'))).rejects.toThrow('5 sekund');
    await vi.advanceTimersByTimeAsync(5000); await pending;
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(mocks.worker.mock.calls[0][1]).toMatchObject({ resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 } });
  });
  it('reports worker failure without exposing parser details', async () => {
    const worker = Object.assign(new EventEmitter(), { terminate: vi.fn().mockResolvedValue(0) });
    mocks.worker.mockReturnValue(worker);
    const pending = expect(validateMenuPdf(Buffer.from('%PDF-1.7'))).rejects.toThrow('jednostronicowy');
    worker.emit('error', new Error('private parser details')); await pending;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
