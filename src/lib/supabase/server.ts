import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: sessionCookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                ...sessionCookieOptions,
              })
            );
          } catch {
            // Server Components cannot mutate cookies. Middleware refreshes the
            // session before protected renders, so a failed write remains Guest.
          }
        },
      },
    }
  );
}
