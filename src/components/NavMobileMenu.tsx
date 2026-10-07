"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Menu, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { navLinks, accountLinksFor, contributionLink, isNavActive } from "@/lib/nav-links";
import { LocationDialog } from "@/components/location/LocationDialog";
import { AuthNavLinks } from "@/components/auth/AuthNavLinks";
import { useGeolocation } from "@/hooks/useGeolocation";
import { Button } from "@/components/ui/button";

interface NavMobileMenuProps {
  isAdmin?: boolean;
  isAuthenticated?: boolean;
  email?: string;
  /** Server-rendered controls preserve the server logout form. */
  accountControls?: ReactNode;
}

export function NavMobileMenu({ isAdmin = false, isAuthenticated = false, email, accountControls }: NavMobileMenuProps) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const [open, setOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const { coordinates, label } = useGeolocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => { setOpen(false); setLocationOpen(false); }, [pathname, query, isAuthenticated, isAdmin, email]);
  useEffect(() => {
    const desktop = window.matchMedia?.("(min-width: 1440px)");
    const closeOnDesktop = () => { setOpen(false); setLocationOpen(false); };
    desktop?.addEventListener("change", closeOnDesktop);
    return () => desktop?.removeEventListener("change", closeOnDesktop);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); toggleRef.current?.focus(); }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const renderLink = (link: { href: string; label: string }) => (
    <Link key={link.href} href={link.href} aria-current={isNavActive(pathname, link.href) ? "page" : undefined}
      className={cn("rounded-[4px] px-3 py-3 text-base font-medium transition-colors min-h-[44px] flex items-center",
        isNavActive(pathname, link.href) ? "text-[#f7f8f8] bg-[#1e2023]" : "text-[#a1a5ad] hover:text-primary")}>
      {link.label}
    </Link>
  );
  return (
    <div ref={containerRef} className="xl:hidden"
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
      }}>
      <button ref={toggleRef} type="button" aria-expanded={open} aria-controls={menuId}
        onClick={() => setOpen(!open)}
        className="xl:hidden min-h-[44px] min-w-[44px] flex items-center justify-center text-[#f7f8f8]"
        aria-label={open ? "Zamknij menu" : "Otwórz menu"}>
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      {open && (
        <nav id={menuId} aria-label="Nawigacja mobilna"
          className="xl:hidden max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-t border-border bg-[#0f1011] px-4 py-3 absolute top-14 left-0 right-0 z-50"
          onClick={(event) => { if ((event.target as Element).closest("a")) setOpen(false); }}
          onSubmit={() => setOpen(false)}>
          <div className="flex flex-col gap-2">
            <p className="px-3 text-xs text-[#a1a5ad]">Przeglądaj</p>
            {navLinks.map(renderLink)}
            <Button asChild className="my-2 min-h-[44px] justify-start">
              <Link href={contributionLink.href}><Plus className="size-4" />{contributionLink.label}</Link>
            </Button>
          </div>
          <div className="flex flex-col gap-2 pt-3 mt-2 border-t border-border">
            <p className="px-3 text-xs text-[#a1a5ad]">Konto</p>
            {isAuthenticated && <p className="px-3 text-sm text-[#f7f8f8] [overflow-wrap:anywhere]">{email ?? "Twoje konto"}</p>}
            {accountLinksFor(isAdmin, isAuthenticated).map(renderLink)}
            {!isAuthenticated && (accountControls ?? <AuthNavLinks />)}
          </div>
          <div className="pt-3 mt-2 border-t border-border">
            <p className="px-3 text-xs text-[#a1a5ad]">Lokalizacja</p>
            <p className="px-3 py-2 text-sm text-[#f7f8f8] [overflow-wrap:anywhere]">{coordinates ? label ?? "Lokalizacja ustawiona" : "Lokalizacja nieustawiona"}</p>
            <Button variant="ghost" className="min-h-[44px] text-[#f7f8f8]" aria-haspopup="dialog"
              onClick={() => { setLocationOpen(true); setOpen(false); }}>
              {coordinates ? "Zmień lokalizację" : "Ustaw lokalizację"}
            </Button>
          </div>
          {isAuthenticated && <div className="pt-3 mt-2 border-t border-border">{accountControls}</div>}
        </nav>
      )}
      <LocationDialog open={locationOpen} onOpenChange={setLocationOpen} onCloseAutoFocus={(event) => {
        event.preventDefault();
        toggleRef.current?.focus();
      }} />
    </div>
  );
}
