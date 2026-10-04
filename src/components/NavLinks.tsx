"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { linksFor } from "@/lib/nav-links";

interface NavLinksProps {
  /**
   * Whether the viewer is an admin, decided in `NavHeader`.
   *
   * A boolean rather than the user, so this component never has an identity to
   * hold and cannot accidentally render something from it.
   */
  isAdmin?: boolean;
}

export function NavLinks({ isAdmin = false }: NavLinksProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <nav className="hidden lg:flex lg:items-center lg:gap-2">
      {linksFor(isAdmin).map((link) => (
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
