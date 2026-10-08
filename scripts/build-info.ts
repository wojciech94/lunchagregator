import { execFileSync } from 'node:child_process';
import { version } from '../package.json';

/** Called by Next only while compiling, never when serving an existing build. */
export function createBuildInfo(
  env: Partial<NodeJS.ProcessEnv> = process.env,
  readCommit = () => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(),
  now = () => new Date().toISOString(),
) {
  let commit = env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA;
  if (!commit) {
    try { commit = readCommit(); } catch { /* Source archives may have no Git checkout. */ }
  }
  // Only commit identifiers are public; reject malformed provider input.
  commit = commit && /^[a-f0-9]{40,64}$/i.test(commit) ? commit : 'unknown';
  return {
    version,
    commit,
    builtAt: now(),
    environment: env.VERCEL_ENV || (env.NODE_ENV === 'production' ? 'production' : 'development'),
  };
}
