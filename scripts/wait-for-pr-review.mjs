import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

export const policy = JSON.parse(readFileSync(new URL('./pr-review-policy.json', import.meta.url), 'utf8'));
const exec = promisify(execFile);

// A completed review is evidence to inspect, including COMMENTED/CHANGES_REQUESTED.
// It is not evidence that the PR is ready to merge.
export function classify(snapshot, head, bot) {
  if (snapshot.state !== 'OPEN') return 'closed';
  if (snapshot.headRefOid !== head) return 'head-changed';
  return snapshot.reviews.some(review =>
    review.user?.login === bot && review.commit_id === head &&
    ['APPROVED', 'COMMENTED', 'CHANGES_REQUESTED'].includes(review.state) &&
    review.submitted_at
  ) ? 'feedback' : 'pending';
}

export async function readSnapshot({ repo, pr, head, signal, request }) {
  const statusArgs = ['pr', 'view', pr, '--repo', repo, '--json', 'state,headRefOid'];
  const initial = JSON.parse(await request(statusArgs, signal));
  if (initial.state !== 'OPEN' || initial.headRefOid !== head) return { ...initial, reviews: [] };
  const reviews = JSON.parse(await request(
    ['api', '--paginate', '--slurp', `repos/${repo}/pulls/${pr}/reviews`], signal
  )).flat();
  // Reviews may arrive after a push or closure: classify against the final state.
  const current = JSON.parse(await request(statusArgs, signal));
  return { ...current, reviews };
}

export async function waitForReview({ head, bot, publishedAt, deadline, read, now = Date.now, pause = ms => sleep(ms) }) {
  const stopAt = Math.min(publishedAt + policy.reviewWaitMs, deadline);
  while (now() < stopAt) {
    const budget = Math.min(policy.requestTimeoutMs, stopAt - now());
    const controller = new AbortController();
    let timer;
    let snapshot;
    try {
      snapshot = await Promise.race([
        read(controller.signal),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('GitHub read exceeded its time budget'));
          }, budget);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
    if (now() >= stopAt) return 'timeout';
    const result = classify(snapshot, head, bot);
    if (result !== 'pending') return result;
    await pause(Math.min(policy.pollIntervalMs, Math.max(0, stopAt - now())));
  }
  return 'timeout';
}

async function main() {
  const { values } = parseArgs({ options: Object.fromEntries(
    ['repo', 'pr', 'head', 'bot', 'published-at', 'deadline'].map(key => [key, { type: 'string' }])
  ) });
  const { repo, pr, head, bot } = values;
  const publishedAt = Date.parse(values['published-at']);
  const deadline = Date.parse(values.deadline);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '') || !/^[1-9]\d*$/.test(pr ?? '') ||
      !/^[a-f0-9]{40}$/.test(head ?? '') || !bot ||
      !Number.isFinite(publishedAt) || !Number.isFinite(deadline) ||
      publishedAt > Date.now() || deadline <= publishedAt ||
      deadline - publishedAt > policy.totalBudgetMs) {
    throw new Error('Provide --repo owner/repo --pr number --head SHA --bot login --published-at ISO-date --deadline ISO-date (original session deadline, at most 30 minutes after publication)');
  }
  const request = async (args, signal) => {
    const options = { signal, maxBuffer: 8 * 1024 * 1024, windowsHide: true };
    const result = await exec('gh', args, options);
    return result.stdout;
  };
  const read = signal => readSnapshot({ repo, pr, head, signal, request });
  const result = await waitForReview({ head, bot, publishedAt, deadline, read });
  console.log(JSON.stringify({ result, repo, pr, head }));
  process.exitCode = result === 'feedback' ? 0 : result === 'timeout' ? 2 : 3;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
