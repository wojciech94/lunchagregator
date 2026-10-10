"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navLinks, isNavActive } from "@/lib/nav-links";

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Nawigacja główna" className="hidden shrink-0 xl:flex xl:items-center xl:gap-1">
      {navLinks.map((link) => (
        <Link key={link.href} href={link.href} aria-current={isNavActive(pathname, link.href) ? "page" : undefined}
          className={cn("rounded-md px-3 py-2 text-sm font-medium transition-colors min-h-[44px] flex items-center",
            isNavActive(pathname, link.href) ? "text-foreground bg-accent" : "text-muted-foreground hover:text-primary")}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
