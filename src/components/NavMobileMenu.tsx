"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { linksFor } from "@/lib/nav-links";
import { LocationIndicator } from "@/components/location/LocationIndicator";

interface NavMobileMenuProps {
  /**
   * Whether the viewer is an admin, decided in `NavHeader`.
   *
   * The same flag `NavLinks` takes, and passed for the same reason: the desktop
   * bar and this menu are two views of one list, and a link that appears in only
   * one of them is a link that works at one screen width and 404s at the other.
   */
  isAdmin?: boolean;
}

export function NavMobileMenu({ isAdmin = false }: NavMobileMenuProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setOpen(!open)}
        className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center text-[#f7f8f8]"
        aria-label={open ? "Zamknij menu" : "Otwórz menu"}
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {/* Mobile menu */}
      {open && (
        <nav className="md:hidden border-t border-border bg-[#0f1011] px-4 py-3 absolute top-14 left-0 right-0 z-50">
          <div className="flex flex-col gap-2">
            {linksFor(isAdmin).map((link) => (
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
    </>
  );
}
