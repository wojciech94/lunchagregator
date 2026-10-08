import { expect, it, vi } from 'vitest';

it('returns compiled identity even when runtime environment changes, with no shared cache', async () => {
  const metadata = { version: '0.2.0', commit: 'a'.repeat(40), builtAt: '2026-10-08T12:00:00.000Z', environment: 'preview' };
  vi.stubEnv('NEXT_PUBLIC_APP_BUILD_INFO', JSON.stringify(metadata));
  vi.resetModules();
  try {
    const { GET } = await import('./route');
    vi.stubEnv('NEXT_PUBLIC_APP_BUILD_INFO', JSON.stringify({ ...metadata, version: '99.0.0' }));
    const response = GET();
    expect(await response.json()).toEqual(metadata);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  } finally {
    vi.unstubAllEnvs();
    vi.resetModules();
  }
});
