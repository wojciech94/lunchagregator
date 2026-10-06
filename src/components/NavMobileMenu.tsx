"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { linksFor } from "@/lib/nav-links";
import { LocationIndicator } from "@/components/location/LocationIndicator";
import { AuthNavLinks } from "@/components/auth/AuthNavLinks";

interface NavMobileMenuProps {
  /**
   * Whether the viewer is an admin, decided in `NavHeader`.
   *
   * The same flag `NavLinks` takes, and passed for the same reason: the desktop
   * bar and this menu are two views of one list, and a link that appears in only
   * one of them is a link that works at one screen width and 404s at the other.
   */
  isAdmin?: boolean;
  /** Same courtesy rule as `isAdmin`: the User's links appear when signed in. */
  isAuthenticated?: boolean;
  /** Server-rendered account controls keep the logout action on the server. */
  accountControls?: ReactNode;
}

export function NavMobileMenu({
  isAdmin = false,
  isAuthenticated = false,
  accountControls,
}: NavMobileMenuProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    setOpen(false);
  }, [pathname, query, isAuthenticated, isAdmin]);

  useEffect(() => {
    const desktop = window.matchMedia?.('(min-width: 1440px)');
    // Matches this repository's xl breakpoint in globals.css.
    const closeOnDesktop = () => {
      if (desktop?.matches) setOpen(false);
    };
    desktop?.addEventListener('change', closeOnDesktop);
    return () => desktop?.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <div
      ref={containerRef}
      className="xl:hidden"
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      {/* Mobile hamburger */}
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
        className="xl:hidden min-h-[44px] min-w-[44px] flex items-center justify-center text-[#f7f8f8]"
        aria-label={open ? "Zamknij menu" : "Otwórz menu"}
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {/* Mobile menu */}
      {open && (
        <nav
          id={menuId}
          aria-label="Nawigacja mobilna"
          className="xl:hidden max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-t border-border bg-[#0f1011] px-4 py-3 absolute top-14 left-0 right-0 z-50"
          onClick={(event) => {
            if ((event.target as Element).closest('a')) setOpen(false);
          }}
          onSubmit={() => setOpen(false)}
        >
          <div className="flex flex-col gap-2">
            {linksFor(isAdmin, isAuthenticated).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
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
          <div className="flex flex-col gap-2 pt-3 mt-2 border-t border-border">
            {accountControls ?? (!isAuthenticated ? <AuthNavLinks /> : null)}
          </div>
          {/* Location indicator in mobile menu */}
          <div className="pt-3 mt-2 border-t border-border">
            <LocationIndicator />
          </div>
        </nav>
      )}
    </div>
  );
}
