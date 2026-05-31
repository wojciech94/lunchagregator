import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import { getUser } from "@/lib/auth";
import { LocationIndicator } from "@/components/location/LocationIndicator";
import { NavLinks } from "@/components/NavLinks";
import { NavMobileMenu } from "@/components/NavMobileMenu";
import { LogoutButton } from "@/components/auth/LogoutButton";

export async function NavHeader() {
  const user = await getUser();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-[#0f1011]">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4 md:px-6">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 text-[#f7f8f8] font-semibold min-h-[44px]"
        >
          <UtensilsCrossed className="size-5 text-primary" />
          <span className="hidden sm:inline text-base">Lunch Agregator</span>
          <span className="sm:hidden text-base">🍽️ Lunch</span>
        </Link>

        {/* Desktop navigation */}
        <NavLinks />

        {/* Right side: auth + location + mobile toggle */}
        <div className="flex items-center gap-1">
          {/* Auth controls (desktop) */}
          <div className="hidden md:flex md:items-center md:gap-2">
            {user ? (
              <>
                <span className="text-sm text-[#62666d] truncate max-w-[200px]">
                  {user.email}
                </span>
                <LogoutButton />
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="rounded-[4px] px-3 py-2 text-sm font-medium text-[#62666d] hover:text-primary transition-colors min-h-[44px] flex items-center"
                >
                  Zaloguj się
                </Link>
                <Link
                  href="/auth/register"
                  className="rounded-[4px] px-3 py-2 text-sm font-medium text-[#62666d] hover:text-primary transition-colors min-h-[44px] flex items-center"
                >
                  Zarejestruj się
                </Link>
              </>
            )}
          </div>

          <div className="hidden md:block">
            <LocationIndicator />
          </div>

          {/* Mobile hamburger + dropdown */}
          <NavMobileMenu />
        </div>
      </div>
    </header>
  );
}
