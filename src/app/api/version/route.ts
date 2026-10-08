import { appBuildInfo } from '@/lib/app-version';

// Return this deployment's compiled metadata, without a shared CDN cache.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(appBuildInfo, { headers: { 'Cache-Control': 'no-store' } });
}
