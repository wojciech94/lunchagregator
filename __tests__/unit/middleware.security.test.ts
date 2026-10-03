import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  mockCreateServerClient,
  mockSupabaseAuth,
  mockSupabaseClient,
} from '../../tests/setup';

type SessionCookie = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

type ServerClientOptions = {
  cookies: {
    setAll: (cookies: SessionCookie[], headers: Record<string, string>) => void;
  };
};

async function loadMiddleware(nodeEnv: 'production' | 'test') {
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.resetModules();
  return import('@/middleware');
}

describe('middleware session security', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('redirects insecure production auth requests to HTTPS before session validation', async () => {
    const { middleware } = await loadMiddleware('production');
    const request = new NextRequest(
      'http://lunch.example/auth/login?redirectTo=%2Fadd',
      { headers: { 'x-forwarded-proto': 'http' } }
    );

    const response = await middleware(request);

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://lunch.example/auth/login?redirectTo=%2Fadd'
    );
    expect(mockCreateServerClient).not.toHaveBeenCalled();
    expect(mockSupabaseAuth.getUser).not.toHaveBeenCalled();
  });

  it('does not redirect local-development HTTP auth requests', async () => {
    const { middleware } = await loadMiddleware('test');
    const request = new NextRequest('http://localhost:3000/auth/login');

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(mockCreateServerClient).not.toHaveBeenCalled();
    expect(mockSupabaseAuth.getUser).not.toHaveBeenCalled();
  });

  it('silently refreshes an authenticated session and preserves hardened cookie options', async () => {
    let serverClientOptions: ServerClientOptions | undefined;
    mockCreateServerClient.mockImplementation((...args: unknown[]) => {
      serverClientOptions = args[2] as ServerClientOptions;
      return mockSupabaseClient;
    });
    mockSupabaseAuth.getUser.mockImplementation(async () => {
      serverClientOptions?.cookies.setAll(
        [
          {
            name: 'sb-access-token',
            value: 'refreshed-token',
            options: {
              path: '/',
              maxAge: 3600,
              httpOnly: false,
              sameSite: 'none',
              secure: false,
            },
          },
        ],
        { 'cache-control': 'no-store' }
      );
      return {
        data: { user: { id: 'user-1', email: 'owner@example.com' } },
        error: null,
      };
    });
    const { middleware } = await loadMiddleware('production');

    const response = await middleware(
      new NextRequest('https://lunch.example/restaurants/new')
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(mockSupabaseAuth.getUser).toHaveBeenCalledOnce();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.cookies.get('sb-access-token')).toMatchObject({
      value: 'refreshed-token',
      path: '/',
      maxAge: 3600,
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
    });
  });

  it('treats a failed refresh as Guest and preserves session-clearing cookies', async () => {
    let serverClientOptions: ServerClientOptions | undefined;
    mockCreateServerClient.mockImplementation((...args: unknown[]) => {
      serverClientOptions = args[2] as ServerClientOptions;
      return mockSupabaseClient;
    });
    mockSupabaseAuth.getUser.mockImplementation(async () => {
      serverClientOptions?.cookies.setAll(
        [
          {
            name: 'sb-refresh-token',
            value: '',
            options: { path: '/', maxAge: 0 },
          },
        ],
        {}
      );
      return { data: { user: null }, error: new Error('refresh failed') };
    });
    const { middleware } = await loadMiddleware('production');

    const response = await middleware(
      new NextRequest('https://lunch.example/add')
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://lunch.example/auth/login?redirectTo=%2Fadd'
    );
    expect(response.cookies.get('sb-refresh-token')).toMatchObject({
      value: '',
      path: '/',
      maxAge: 0,
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
    });
  });
});
