import * as React from "react";
import { cn } from "@/lib/utils";

export interface ChipProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  /**
   * On/off state, announced to assistive tech via `aria-pressed`.
   * The caller owns the toggle logic; this component owns the look.
   */
  active?: boolean;
  className?: string;
}

/**
 * The one selectable-pill control (#82).
 *
 * Two jobs, one look: multi-select **filter chips** (cuisine, price level on
 * the listings) and **single-choice option groups** (the price level in the
 * restaurant form). Both used to be hand-rolled with three dialects between
 * them -- rounded-full here, rounded-[4px] there, three hover treatments.
 *
 * Generous sizing stays deliberate (Req 7.3/7.4): the pill body is
 * comfortable to hit and the label inherits 16px.
 */
export function Chip({ active = false, className, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-3 py-1.5 text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
        className
      )}
      {...props}
    />
  );
}
