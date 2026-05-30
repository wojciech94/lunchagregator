"use client";

import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecommendationCardProps {
  id: string;
  dishName: string;
  price: number;
  restaurantName: string;
  className?: string;
}

/**
 * A compact card showing a recommended offer (dish name, price, restaurant name).
 * Can be embedded within assistant messages and links to the offer detail page.
 */
export function RecommendationCard({
  id,
  dishName,
  price,
  restaurantName,
  className,
}: RecommendationCardProps) {
  return (
    <Link
      href={`/offers/${id}`}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-sm",
        "transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "min-h-[44px]",
        className
      )}
      aria-label={`${dishName} - ${restaurantName}, ${price.toFixed(2)} PLN`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
        <UtensilsCrossed className="h-4 w-4 text-primary" aria-hidden="true" />
      </div>
      <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
        <span className="truncate text-sm font-medium text-card-foreground">
          {dishName}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {restaurantName}
        </span>
      </div>
      <span className="shrink-0 text-sm font-bold text-primary">
        {price.toFixed(2)} PLN
      </span>
    </Link>
  );
}
