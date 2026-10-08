"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Popover } from "radix-ui";
import { ChevronDown, UserRound, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGeolocation } from "@/hooks/useGeolocation";
import { accountLinksFor, isNavActive } from "@/lib/nav-links";
import { LocationDialog } from "@/components/location/LocationDialog";
import { cn } from "@/lib/utils";
import { AppVersion } from "@/components/AppVersion";

export function AccountMenu({ email, isAdmin, logout }: { email: string; isAdmin: boolean; logout: ReactNode }) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const { coordinates, label } = useGeolocation();
  const [open, setOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(false); setLocationOpen(false); }, [pathname, query, email, isAdmin]);
  useEffect(() => {
    const desktop = window.matchMedia?.("(min-width: 1440px)");
    const close = () => { setOpen(false); setLocationOpen(false); };
    desktop?.addEventListener("change", close);
    return () => desktop?.removeEventListener("change", close);
  }, []);

  const active = accountLinksFor(isAdmin, true).some((link) => isNavActive(pathname, link.href));
  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <Button ref={trigger} variant="ghost" className={cn("min-h-[44px] max-w-[240px] text-[#f7f8f8] hover:bg-white/10 hover:text-[#f7f8f8] data-[state=open]:bg-white/10", active && "bg-white/10")} aria-label="Menu profilu">
            <UserRound className="size-4 shrink-0" />
            <span className="truncate">{email}</span>
            <ChevronDown className="size-4 shrink-0" />
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content ref={content} align="end" sideOffset={8} collisionPadding={16}
            aria-label="Menu profilu"
            className="z-50 w-80 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
            onOpenAutoFocus={(event) => { event.preventDefault(); content.current?.querySelector<HTMLElement>("a, button")?.focus(); }}
            onCloseAutoFocus={(event) => { if (locationOpen) event.preventDefault(); }}
            onKeyDown={(event) => {
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
              const items = Array.from(content.current?.querySelectorAll<HTMLElement>("a, button") ?? []);
              const current = items.indexOf(document.activeElement as HTMLElement);
              const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 :
                (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
              event.preventDefault();
              items[next]?.focus();
            }}>
            <p className="px-2 text-xs text-muted-foreground">Twoje konto</p>
            <p className="px-2 pb-3 pt-1 text-sm [overflow-wrap:anywhere]">{email}</p>
            <nav aria-label="Nawigacja konta" className="border-t border-border py-2">
              {accountLinksFor(isAdmin, true).map((link) => (
                <Link key={link.href} href={link.href} onClick={() => setOpen(false)}
                  aria-current={isNavActive(pathname, link.href) ? "page" : undefined}
                  className={cn("flex min-h-[44px] items-center rounded-md px-2 text-sm hover:bg-accent", isNavActive(pathname, link.href) && "bg-accent text-primary")}>
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="border-t border-border py-3">
              <p className="flex items-center gap-2 px-2 text-xs text-muted-foreground"><MapPin className="size-4" />Lokalizacja</p>
              <p className="px-2 py-1 text-sm [overflow-wrap:anywhere]">{coordinates ? label ?? "Lokalizacja ustawiona" : "Lokalizacja nieustawiona"}</p>
              <Button variant="ghost" size="sm" className="min-h-[44px]" aria-haspopup="dialog" onClick={() => { setLocationOpen(true); setOpen(false); }}>
                {coordinates ? "Zmień lokalizację" : "Ustaw lokalizację"}
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2" onSubmit={() => setOpen(false)}>
              {logout}
              <AppVersion />
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <LocationDialog open={locationOpen} onOpenChange={setLocationOpen} onCloseAutoFocus={(event) => {
        event.preventDefault();
        trigger.current?.focus();
      }} />
    </>
  );
}
