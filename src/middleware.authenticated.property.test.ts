// Feature: user-authentication, Property 4: Middleware passes authenticated requests to protected routes

import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { setMockUser } from '../tests/setup';
import { fc } from '../__tests__/properties/fc-config';
import { middleware } from './middleware';

/**
 * Property 4: Middleware passes authenticated requests to protected routes.
 *
 * **Validates: Requirements 4.3**
 */
const protectedRoutePathArb = fc.oneof(
  fc.constant('/restaurants/new'),
  fc.uuid().map((id) => `/restaurants/${id}/edit`),
  fc.uuid().map((id) => `/offers/${id}/edit`),
  fc.constant('/add')
);

describe('Property 4: Middleware passes authenticated requests to protected routes', () => {
  it('allows every protected route request from an authenticated user without redirecting', async () => {
    await fc.assert(
      fc.asyncProperty(protectedRoutePathArb, async (pathname) => {
        setMockUser({
          id: '30b9db84-a8fe-4c82-9ae1-c0d687f48a0a',
          email: 'owner@example.com',
        });

        const response = await middleware(
          new NextRequest(`https://lunchagregator.test${pathname}`)
        );

        expect(response.headers.get('location')).toBeNull();
        expect(response.status).toBeLessThan(300);
      })
    );
  });
});
