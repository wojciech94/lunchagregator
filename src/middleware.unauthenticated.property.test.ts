import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { fc } from "../__tests__/properties/fc-config";
import { mockSupabaseAuth } from "../tests/setup";
import { middleware } from "./middleware";

type ProtectedRouteShape =
  | "restaurant-new"
  | "restaurant-edit"
  | "offer-edit"
  | "offer-delete"
  | "add";

const protectedRouteArbitrary = fc
  .tuple(
    fc.constantFrom<ProtectedRouteShape>(
      "restaurant-new",
      "restaurant-edit",
      "offer-edit",
      "offer-delete",
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
      case "offer-delete":
        return `/offers/${id}/delete`;
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
});
