import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { createBuildInfo } from "./scripts/build-info";

export default function nextConfig(phase: string): NextConfig {
  if (phase !== PHASE_PRODUCTION_BUILD && phase !== PHASE_DEVELOPMENT_SERVER) return {};
  // Next also loads config in build workers. They inherit this snapshot so the
  // server, browser and recorded build config receive exactly the same identity.
  const snapshot = process.env.LUNCH_BUILD_INFO_SNAPSHOT ?? JSON.stringify(createBuildInfo());
  process.env.LUNCH_BUILD_INFO_SNAPSHOT = snapshot;
  return {
    // Isolate local E2E builds from a developer's running Next server.
    distDir: process.env.NEXT_BUILD_DIR ?? ".next",
    serverExternalPackages: ['pdf-lib'],
    outputFileTracingIncludes: {
      '/*': ['./scripts/validate-menu-pdf.cjs', './node_modules/pdf-lib/**/*', './node_modules/@pdf-lib/**/*', './node_modules/pako/**/*', './node_modules/tslib/**/*'],
    },
    env: {
      NEXT_PUBLIC_APP_BUILD_INFO: snapshot,
    },
  };
}
