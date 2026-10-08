import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { fc } from "../__tests__/properties/fc-config";
import { mockSupabaseAuth } from "../tests/setup";
import { middleware } from "./middleware";
import { loginAction } from "./actions/auth";

type ProtectedRouteShape =
  | "restaurant-new"
  | "restaurant-edit"
  | "offer-edit"
  | "add";

const protectedRouteArbitrary = fc
  .tuple(
    fc.constantFrom<ProtectedRouteShape>(
      "restaurant-new",
      "restaurant-edit",
      "offer-edit",
      "add"
    ),
    fc.uuid()
  )
  .map(([shape, id]) => {
    switch (shape) {
      case "restaurant-new":
        return "/restaurants/new";
      case "restaurant-edit":
        return `/restaurants/${id}/edit`;
      case "offer-edit":
        return `/offers/${id}/edit`;
      case "add":
        return "/add";
    }
  });

describe("Feature: user-authentication, Property 3: Middleware redirects unauthenticated requests to protected routes", () => {
  // **Validates: Requirements 3.5, 4.1**
  it("redirects every protected-route shape to login with its original pathname", async () => {
    mockSupabaseAuth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await fc.assert(
      fc.asyncProperty(protectedRouteArbitrary, async (pathname) => {
        const request = new NextRequest(`https://lunchagregator.test${pathname}`);
        const response = await middleware(request);
        const location = response.headers.get("location");

        expect(response.status).toBe(307);
        expect(location).not.toBeNull();

        const loginUrl = new URL(location!, request.url);
        expect(loginUrl.pathname).toBe("/auth/login");
        expect(loginUrl.searchParams.get("redirectTo")).toBe(pathname);
      })
    );
  });

  it("preserves query values on protected routes without changing the login origin", async () => {
    mockSupabaseAuth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await fc.assert(
      fc.asyncProperty(protectedRouteArbitrary, fc.string(), async (pathname, queryValue) => {
        const search = new URLSearchParams({ q: queryValue, redirectTo: "https://attacker.example" });
        const request = new NextRequest(`https://lunchagregator.test${pathname}?${search}`);
        const response = await middleware(request);
        const loginUrl = new URL(response.headers.get("location")!);

        expect(loginUrl.origin).toBe(request.nextUrl.origin);
        expect(loginUrl.pathname).toBe("/auth/login");
        expect(loginUrl.searchParams.get("redirectTo")).toBe(`${pathname}${request.nextUrl.search}`);
      })
    );
  });

  it("returns to the originating Restaurant after a guest logs in", async () => {
    const destination = "/add?restaurantId=550e8400-e29b-41d4-a716-446655440000";
    mockSupabaseAuth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await middleware(new NextRequest(`https://lunchagregator.test${destination}`));
    const loginUrl = new URL(response.headers.get("location")!);
    const redirectTo = loginUrl.searchParams.get("redirectTo");
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-123" }, session: { access_token: "test-session" } },
      error: null,
    });
    const credentials = new FormData();
    credentials.set("email", "owner@example.com");
    credentials.set("password", "password123");

    const result = await loginAction(credentials, redirectTo);

    expect(result).toMatchObject({ success: true, redirectTo: destination });
  });
});
