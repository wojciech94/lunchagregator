import { afterEach, expect, it, vi } from 'vitest';
import { PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from 'next/constants';
import nextConfig from '../next.config';

afterEach(() => { vi.unstubAllEnvs(); });

it('shares one identity across repeated config loads and inherited build workers', () => {
  vi.stubEnv('LUNCH_BUILD_INFO_SNAPSHOT', undefined);
  const first = nextConfig(PHASE_PRODUCTION_BUILD).env?.NEXT_PUBLIC_APP_BUILD_INFO;
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'd'.repeat(40));
  const second = nextConfig(PHASE_PRODUCTION_BUILD).env?.NEXT_PUBLIC_APP_BUILD_INFO;
  expect(second).toBe(first);
  expect(process.env.LUNCH_BUILD_INFO_SNAPSHOT).toBe(first);
});

it('does not generate or replace metadata when starting a production server', () => {
  vi.stubEnv('LUNCH_BUILD_INFO_SNAPSHOT', undefined);
  expect(nextConfig(PHASE_PRODUCTION_SERVER)).toEqual({});
  expect(process.env.LUNCH_BUILD_INFO_SNAPSHOT).toBeUndefined();
});
