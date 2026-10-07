import Link from "next/link";
import { Plus, UtensilsCrossed } from "lucide-react";
import { getUser } from "@/lib/auth";
import { isAdmin } from "@/lib/ownership";
import { LocationIndicator } from "@/components/location/LocationIndicator";
import { NavLinks } from "@/components/NavLinks";
import { NavMobileMenu } from "@/components/NavMobileMenu";
import { AccountMenu } from "@/components/AccountMenu";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AuthNavLinks } from "@/components/auth/AuthNavLinks";
import { Button } from "@/components/ui/button";

export async function NavHeader() {
  const user = await getUser();
  // Server-derived role: presentation is not a substitute for authorization.
  const viewerIsAdmin = isAdmin(user);
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-[#0f1011]">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-3 px-4 md:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-[#f7f8f8] font-semibold min-h-[44px]">
          <UtensilsCrossed className="size-5 text-primary" />
          <span className="text-base">Lunch Agregator</span>
        </Link>
        <NavLinks />
        <div className="flex min-w-0 items-center gap-2">
          <div className="hidden xl:flex xl:items-center xl:gap-3">
            <Button asChild className="min-h-[44px]"><Link href="/add"><Plus className="size-4" />Dodaj ofertę</Link></Button>
            {user ? <AccountMenu key={user.id} email={user.email ?? "Twoje konto"} isAdmin={viewerIsAdmin} logout={<LogoutButton />} /> :
              <><AuthNavLinks /><div className="text-[#f7f8f8]"><LocationIndicator compact /></div></>}
          </div>
          <NavMobileMenu isAdmin={viewerIsAdmin} isAuthenticated={!!user} email={user?.email}
            accountControls={user ? <LogoutButton /> : <AuthNavLinks />} />
        </div>
      </div>
    </header>
  );
}
