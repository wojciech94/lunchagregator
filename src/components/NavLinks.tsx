"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/", label: "Oferty" },
  { href: "/restaurants", label: "Restauracje" },
  { href: "/add", label: "Dodaj ofertę" },
  { href: "/chat", label: "Czat AI" },
] as const;

export function NavLinks() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <nav className="hidden lg:flex lg:items-center lg:gap-2">
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
  );
}
