"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LunchHours } from "@/types/restaurants";

export interface LunchHoursInputProps {
  value: LunchHours | null;
  onChange: (hours: LunchHours | null) => void;
  error?: string;
}

export function LunchHoursInput({ value, onChange, error }: LunchHoursInputProps) {
  function handleStartChange(e: React.ChangeEvent<HTMLInputElement>) {
    const start = e.target.value;
    if (!start && !value?.end) {
      onChange(null);
      return;
    }
    onChange({ start, end: value?.end ?? "" });
  }

  function handleEndChange(e: React.ChangeEvent<HTMLInputElement>) {
    const end = e.target.value;
    if (!end && !value?.start) {
      onChange(null);
      return;
    }
    onChange({ start: value?.start ?? "", end });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lunch-hours-start">Od</Label>
          <Input
            id="lunch-hours-start"
            type="time"
            value={value?.start ?? ""}
            onChange={handleStartChange}
            aria-invalid={!!error}
            aria-describedby={error ? "lunch-hours-error" : undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lunch-hours-end">Do</Label>
          <Input
            id="lunch-hours-end"
            type="time"
            value={value?.end ?? ""}
            onChange={handleEndChange}
            aria-invalid={!!error}
            aria-describedby={error ? "lunch-hours-error" : undefined}
          />
        </div>
      </div>
      {error && (
        <p
          id="lunch-hours-error"
          className="text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
