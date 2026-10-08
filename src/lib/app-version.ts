import { version } from '../../package.json';

export interface AppBuildInfo {
  version: string;
  commit: string;
  builtAt: string | null;
  environment: string;
}

// Next replaces this literal environment access in both server and client bundles.
// The fallback supports unit tests and use outside the Next compiler.
export const appBuildInfo: AppBuildInfo = process.env.NEXT_PUBLIC_APP_BUILD_INFO
  ? JSON.parse(process.env.NEXT_PUBLIC_APP_BUILD_INFO)
  : { version, commit: 'unknown', builtAt: null, environment: 'development' };

export const appVersionLabel = `v${appBuildInfo.version} · ${appBuildInfo.commit === 'unknown' ? 'unknown' : appBuildInfo.commit.slice(0, 7)}`;
