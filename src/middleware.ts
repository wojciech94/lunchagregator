import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

const isProduction = process.env.NODE_ENV === "production";
const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isProduction,
};

function isProtectedRoute(pathname: string): boolean {
  return (
    pathname === "/restaurants/new" ||
    /^\/restaurants\/[^/]+\/edit$/.test(pathname) ||
    /^\/offers\/[^/]+\/(edit|delete)$/.test(pathname) ||
    pathname === "/add"
  );
}

function isAuthRoute(pathname: string): boolean {
  return pathname === "/auth" || pathname.startsWith("/auth/");
}

function isHttpsRequest(request: NextRequest): boolean {
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();

  return forwardedProtocol
    ? forwardedProtocol === "https"
    : request.nextUrl.protocol === "https:";
}

function copySessionMutations(source: NextResponse, target: NextResponse): void {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));

  for (const header of ["Cache-Control", "Expires", "Pragma"]) {
    const value = source.headers.get(header);
    if (value) {
      target.headers.set(header, value);
    }
  }
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Enforce HTTPS before any credential route renders or invokes auth logic.
  // Development intentionally permits HTTP to avoid local redirect loops.
  if (isProduction && isAuthRoute(pathname) && !isHttpsRequest(request)) {
    const secureUrl = request.nextUrl.clone();
    secureUrl.protocol = "https:";
    return NextResponse.redirect(secureUrl, 308);
  }

  // The auth matcher exists solely for the HTTPS redirect above. All public
  // routes must pass through without loading or validating a Supabase session.
  if (!isProtectedRoute(pathname)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: sessionCookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );

          const refreshedResponse = NextResponse.next({ request });
          copySessionMutations(response, refreshedResponse);

          cookiesToSet.forEach(({ name, value, options }) =>
            refreshedResponse.cookies.set(name, value, {
              ...options,
              ...sessionCookieOptions,
            })
          );
          Object.entries(headers).forEach(([name, value]) =>
            refreshedResponse.headers.set(name, value)
          );

          response = refreshedResponse;
        },
      },
    }
  );

  // getUser() drives Supabase's SSR refresh flow. A refresh or verification
  // error intentionally falls through as Guest state.
  let user = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    user = error ? null : data.user;
  } catch {
    user = null;
  }

  if (!user) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    const redirectResponse = NextResponse.redirect(loginUrl);
    copySessionMutations(response, redirectResponse);
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    "/restaurants/new",
    "/restaurants/:id/edit",
    "/offers/:id/edit",
    // `/offers/:id/delete` used to be here. It no longer exists: deletion happens
    // in a dialog on the page you are already on, so there is no route to protect.
    // The operation itself is still authenticated, by `deleteOfferAction`.
    "/add",
    "/auth/:path*",
  ],
};
