"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, UtensilsCrossed, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LocationIndicator } from "@/components/location/LocationIndicator";

const navLinks = [
  { href: "/", label: "Oferty" },
  { href: "/restaurants", label: "Restauracje" },
  { href: "/add", label: "Dodaj ofertę" },
  { href: "/chat", label: "Czat AI" },
] as const;

export function NavHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-[#0f1011]">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4 md:px-6">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 text-[#f7f8f8] font-semibold min-h-[44px]"
        >
          <UtensilsCrossed className="size-5 text-primary" />
          <span className="hidden sm:inline text-base">Lunch Aggregator</span>
          <span className="sm:hidden text-base">🍽️ Lunch</span>
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden md:flex md:items-center md:gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-[4px] px-3 py-2 text-sm font-medium transition-colors min-h-[44px] flex items-center",
                isActive(link.href)
                  ? "text-[#f7f8f8] bg-white/5"
                  : "text-[#62666d] hover:text-primary"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right side: location + mobile toggle */}
        <div className="flex items-center gap-1">
          <div className="hidden md:block">
            <LocationIndicator />
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setOpen(!open)}
            className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center text-[#f7f8f8]"
            aria-label={open ? "Zamknij menu" : "Otwórz menu"}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <nav className="md:hidden border-t border-border bg-[#0f1011] px-4 py-3">
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-[4px] px-3 py-3 text-base font-medium transition-colors min-h-[44px] flex items-center",
                  isActive(link.href)
                    ? "text-[#f7f8f8] bg-[#1e2023]"
                    : "text-[#62666d] hover:text-primary"
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
          {/* Location indicator in mobile menu */}
          <div className="pt-3 mt-2 border-t border-border">
            <LocationIndicator />
          </div>
        </nav>
      )}
    </header>
  );
}
