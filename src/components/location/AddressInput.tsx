"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { geocodeAddressAction } from "@/actions/geocode";
import type { Coordinates } from "@/types/offers";

interface AddressInputProps {
  onLocationResolved: (coordinates: Coordinates, address?: string) => void;
}

export function AddressInput({ onLocationResolved }: AddressInputProps) {
  const inputId = useId();
  const hintId = useId();
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    const trimmed = address.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    const result = await geocodeAddressAction(trimmed);

    setLoading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    if (result.data === null) {
      setError(
        "Nie udało się znaleźć podanego adresu. Spróbuj ponownie."
      );
      return;
    }

    setSuccess(true);
    onLocationResolved(result.data, trimmed);
  };

  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor={inputId}
        className="text-sm font-medium text-foreground"
      >
        Wpisz swój adres
      </label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          type="text"
          className="min-w-0 min-h-[44px]"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="np. ul. Marszałkowska 1, Warszawa"
          maxLength={200}
          disabled={loading || success}
          aria-describedby={hintId}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !loading && !success) {
              event.preventDefault();
              void handleSubmit();
            }
          }}
        />
        <Button
          onClick={handleSubmit}
          disabled={loading || !address.trim() || success}
          size="default"
          className="min-h-[44px]"
        >
          {loading ? "Szukam..." : "Znajdź"}
        </Button>
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        Maksymalnie 200 znaków
      </p>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-success" role="status">
          Lokalizacja znaleziona!
        </p>
      )}
    </div>
  );
}
