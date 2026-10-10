import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import { getUser } from "@/lib/auth";
import { isAdmin } from "@/lib/ownership";
import { LocationIndicator } from "@/components/location/LocationIndicator";
import { NavLinks } from "@/components/NavLinks";
import { NavMobileMenu } from "@/components/NavMobileMenu";
import { AccountMenu } from "@/components/AccountMenu";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AuthNavLinks } from "@/components/auth/AuthNavLinks";
import { AddOfferLink } from "@/components/AddOfferLink";
import { ThemeToggle } from "@/components/ThemeToggle";

export async function NavHeader() {
  const user = await getUser();
  // Server-derived role: presentation is not a substitute for authorization.
  const viewerIsAdmin = isAdmin(user);
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-3 px-4 md:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-foreground font-semibold min-h-[44px]">
          <UtensilsCrossed className="size-5 text-primary" />
          <span className="text-base">Lunch Agregator</span>
        </Link>
        <NavLinks />
        <div className="flex min-w-0 items-center gap-2">
          <div className="hidden xl:flex">
            <AddOfferLink />
          </div>
          <ThemeToggle />
          <div className="hidden xl:flex xl:items-center xl:gap-3">
            {user ? <AccountMenu key={user.id} email={user.email ?? "Twoje konto"} isAdmin={viewerIsAdmin} logout={<LogoutButton />} /> :
              <><AuthNavLinks /><div className="text-foreground"><LocationIndicator compact /></div></>}
          </div>
          <NavMobileMenu isAdmin={viewerIsAdmin} isAuthenticated={!!user} email={user?.email}
            accountControls={user ? <LogoutButton /> : <AuthNavLinks />} />
        </div>
      </div>
    </header>
  );
}
