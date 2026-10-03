import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mockCookies,
  mockCreateServerClient,
  mockSupabaseClient,
} from '../../../tests/setup';

type ServerClientOptions = {
  cookieOptions: Record<string, unknown>;
  cookies: {
    setAll: (
      cookies: Array<{
        name: string;
        value: string;
        options?: Record<string, unknown>;
      }>
    ) => void;
  };
};

async function loadServerClient() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.resetModules();
  return import('@/lib/supabase/server');
}

describe('Supabase server session adapter security', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('propagates Supabase session cookies with production security flags', async () => {
    let serverClientOptions: ServerClientOptions | undefined;
    mockCreateServerClient.mockImplementation((...args: unknown[]) => {
      serverClientOptions = args[2] as ServerClientOptions;
      return mockSupabaseClient;
    });
    const { createClient } = await loadServerClient();

    const client = await createClient();
    serverClientOptions?.cookies.setAll([
      {
        name: 'sb-access-token',
        value: 'new-access-token',
        options: {
          path: '/',
          maxAge: 3600,
          httpOnly: false,
          sameSite: 'none',
          secure: false,
        },
      },
    ]);

    expect(client).toBe(mockSupabaseClient);
    expect(serverClientOptions?.cookieOptions).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
    });
    expect(mockCookies.set).toHaveBeenCalledWith(
      'sb-access-token',
      'new-access-token',
      expect.objectContaining({
        path: '/',
        maxAge: 3600,
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
      })
    );
  });
});
