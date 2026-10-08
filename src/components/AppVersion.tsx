import { appBuildInfo, appVersionLabel } from '@/lib/app-version';

export function AppVersion() {
  return (
    <span className="text-xs text-muted-foreground whitespace-nowrap"
      aria-label={`Wersja aplikacji: ${appVersionLabel}`}
      title={`Wersja: ${appBuildInfo.version}\nCommit: ${appBuildInfo.commit}\nBuild: ${appBuildInfo.builtAt ?? 'unknown'}\nŚrodowisko: ${appBuildInfo.environment}`}>
      {appVersionLabel}
    </span>
  );
}
