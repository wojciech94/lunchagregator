import { afterEach, describe, expect, it, vi } from 'vitest';
import { classify, policy, readSnapshot, waitForReview } from './wait-for-pr-review.mjs';

const head = 'a'.repeat(40);
const bot = 'reviewer[bot]';
const review = { user: { login: bot }, commit_id: head, state: 'COMMENTED', submitted_at: '2026-10-09T00:00:00Z' };
const snapshot = { state: 'OPEN', headRefOid: head, reviews: [review] };

afterEach(() => vi.useRealTimers());

describe('bounded PR review waiting', () => {
  it.each([
    { state: 'OPEN', headRefOid: 'b'.repeat(40), expected: 'head-changed' },
    { state: 'CLOSED', headRefOid: head, expected: 'closed' },
    { state: 'MERGED', headRefOid: head, expected: 'closed' },
  ])('rejects stale feedback when the PR becomes $state/$headRefOid during review fetching', async current => {
    const signal = new AbortController().signal;
    const request = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({ state: 'OPEN', headRefOid: head }))
      .mockResolvedValueOnce(JSON.stringify([[review]]))
      .mockResolvedValueOnce(JSON.stringify(current));
    const result = await waitForReview({ head, bot, publishedAt: Date.now(), deadline: Date.now() + 1000,
      read: () => readSnapshot({ repo: 'owner/repo', pr: '126', head, signal, request }),
    });
    expect(result).toBe(current.expected);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[2]).toEqual(request.mock.calls[0]);
  });

  it('accepts paginated feedback when the final head remains current', async () => {
    const status = JSON.stringify({ state: 'OPEN', headRefOid: head });
    const request = vi.fn().mockResolvedValueOnce(status)
      .mockResolvedValueOnce(JSON.stringify([[], [review]]))
      .mockResolvedValueOnce(status);
    const current = await readSnapshot({ repo: 'owner/repo', pr: '126', head,
      signal: new AbortController().signal, request,
    });
    expect(classify(current, head, bot)).toBe('feedback');
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('accepts completed feedback only from the configured bot on the pinned revision', () => {
    expect(classify(snapshot, head, bot)).toBe('feedback');
    for (const change of [
      { commit_id: 'b'.repeat(40) }, { user: { login: 'someone' } },
      { state: 'PENDING' }, { state: 'DISMISSED' }, { submitted_at: null },
    ]) {
      expect(classify({ ...snapshot, reviews: [{ ...review, ...change }] }, head, bot)).toBe('pending');
    }
    expect(classify({ ...snapshot, state: 'MERGED' }, head, bot)).toBe('closed');
    expect(classify({ ...snapshot, headRefOid: 'b'.repeat(40) }, head, bot)).toBe('head-changed');
  });

  it('times out after six minutes of silence instead of reporting success', async () => {
    let time = 0;
    const read = vi.fn(async () => ({ ...snapshot, reviews: [] }));
    expect(await waitForReview({ head, bot, publishedAt: 0, deadline: policy.totalBudgetMs,
      read, now: () => time, pause: async (ms: number) => { time += ms; },
    })).toBe('timeout');
    expect(time).toBe(policy.reviewWaitMs);
    expect(read).toHaveBeenCalledTimes(policy.reviewWaitMs / policy.pollIntervalMs);
  });

  it('preserves the original deadline across resumes and clips the last sleep', async () => {
    let time = 950;
    expect(await waitForReview({ head, bot, publishedAt: 0, deadline: 1000,
      read: async () => ({ ...snapshot, reviews: [] }), now: () => time,
      pause: async (ms: number) => { time += ms; },
    })).toBe('timeout');
    expect(time).toBe(1000);
    const read = vi.fn();
    expect(await waitForReview({ head, bot, publishedAt: 0, deadline: 1000, read, now: () => 1000 })).toBe('timeout');
    expect(read).not.toHaveBeenCalled();
  });

  it('aborts a hung GitHub request rather than waiting indefinitely', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const waiting = waitForReview({ head, bot, publishedAt: Date.now(), deadline: Date.now() + 1000,
      read: (value: AbortSignal) => { signal = value; return new Promise(() => {}); },
    });
    const assertion = expect(waiting).rejects.toThrow('time budget');
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(signal?.aborted).toBe(true);
  });

  it('stops immediately on API errors and on new feedback', async () => {
    const options = { head, bot, publishedAt: Date.now(), deadline: Date.now() + 1000 };
    const read = vi.fn(async () => { throw new Error('authentication failed'); });
    await expect(waitForReview({ ...options, read })).rejects.toThrow('authentication failed');
    expect(read).toHaveBeenCalledTimes(1);
    expect(await waitForReview({ ...options, read: async () => snapshot })).toBe('feedback');
  });
});
