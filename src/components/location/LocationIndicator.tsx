"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { MapPin } from "lucide-react";
import { useGeolocation } from "@/hooks/useGeolocation";
import { Button } from "@/components/ui/button";
import { LocationDialog } from "./LocationDialog";

/** Shared status/change control, available to guests beside search filters. */
export function LocationIndicator({ compact = false }: { compact?: boolean }) {
  const { coordinates, label } = useGeolocation();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const query = useSearchParams().toString();
  useEffect(() => { setOpen(false); }, [pathname, query]);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div className={compact ? "flex min-w-0 max-w-[220px] items-center gap-2" : "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"}>
      <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        <MapPin className="size-4 shrink-0" />
        <span className={compact ? "truncate" : "[overflow-wrap:anywhere]"} title={label ?? undefined}>{coordinates ? label ?? "Lokalizacja ustawiona" : "Lokalizacja nieustawiona"}</span>
      </span>
      <Button ref={trigger} variant="ghost" size="sm" className="min-h-[44px]" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        {coordinates ? "Zmień lokalizację" : "Ustaw lokalizację"}
      </Button>
      <LocationDialog open={open} onOpenChange={setOpen} onCloseAutoFocus={(event) => {
        event.preventDefault();
        trigger.current?.focus();
      }} />
    </div>
  );
}
