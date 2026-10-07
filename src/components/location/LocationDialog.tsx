"use client";

import { Crosshair, X } from "lucide-react";
import { useGeolocation } from "@/hooks/useGeolocation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AddressInput } from "./AddressInput";

export function LocationDialog({ open, onOpenChange, onCloseAutoFocus }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const { coordinates, label, error, loading, requestLocation, setManualCoordinates, clearLocation } = useGeolocation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader className="pr-8">
          <DialogTitle>Ustawienia lokalizacji</DialogTitle>
          <DialogDescription>Ustaw lokalizację, aby przeglądać oferty i restauracje w pobliżu.</DialogDescription>
        </DialogHeader>
        {coordinates && (
          <div className="min-w-0 rounded-md border border-border p-3">
            <p className="text-sm text-muted-foreground">Obecna lokalizacja</p>
            <p className="[overflow-wrap:anywhere]">{label ?? "Lokalizacja ustawiona"}</p>
            <Button variant="ghost" size="sm" onClick={clearLocation}>Wyczyść lokalizację</Button>
          </div>
        )}
        <Button onClick={requestLocation} disabled={loading} className="w-full min-h-[44px]">
          <Crosshair className="size-4" />
          {loading ? "Określanie..." : "Użyj mojej lokalizacji"}
        </Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <p className="text-center text-sm text-muted-foreground">lub wpisz adres ręcznie</p>
        <AddressInput onLocationResolved={(coords, address) => {
          setManualCoordinates(coords, address);
          onOpenChange(false);
        }} />
        <DialogClose asChild>
          <Button variant="ghost" size="icon" className="absolute top-2 right-2 min-h-[44px] min-w-[44px]" aria-label="Zamknij"><X className="size-4" /></Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
