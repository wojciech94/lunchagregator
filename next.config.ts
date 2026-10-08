import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { createBuildInfo } from "./scripts/build-info";

export default function nextConfig(phase: string): NextConfig {
  if (phase !== PHASE_PRODUCTION_BUILD && phase !== PHASE_DEVELOPMENT_SERVER) return {};
  return {
    env: {
      NEXT_PUBLIC_APP_BUILD_INFO: JSON.stringify(createBuildInfo()),
    },
  };
}
