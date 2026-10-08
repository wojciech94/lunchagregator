import { describe, expect, it, vi } from 'vitest';
import { createBuildInfo } from './build-info';
import { version } from '../package.json';

const vercelCommit = 'a'.repeat(40);
const githubCommit = 'b'.repeat(40);
const timestamp = '2026-10-08T12:00:00.000Z';

describe('compiled build identity', () => {
  it('prefers Vercel source and environment without calling Git', () => {
    const git = vi.fn();
    expect(createBuildInfo({ VERCEL_GIT_COMMIT_SHA: vercelCommit, GITHUB_SHA: githubCommit, VERCEL_ENV: 'preview' }, git, () => timestamp))
      .toEqual({ version, commit: vercelCommit, builtAt: timestamp, environment: 'preview' });
    expect(git).not.toHaveBeenCalled();
  });

  it('supports GitHub Actions and local Git builds', () => {
    expect(createBuildInfo({ GITHUB_SHA: githubCommit, NODE_ENV: 'production' }, () => vercelCommit).commit).toBe(githubCommit);
    const local = createBuildInfo({}, () => vercelCommit);
    expect(local.commit).toBe(vercelCommit);
    expect(local.environment).toBe('development');
    expect(createBuildInfo({ NODE_ENV: 'production' }, () => vercelCommit).environment).toBe('production');
  });

  it('explicitly reports unknown for source archives and malformed provider input', () => {
    expect(createBuildInfo({}, () => { throw new Error('no git'); }).commit).toBe('unknown');
    expect(createBuildInfo({ GITHUB_SHA: 'unexpected input' }).commit).toBe('unknown');
  });
});
