import Link from "next/link";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LunchOfferWithDistance } from "@/types/offers";

interface OfferCardProps {
  offer: LunchOfferWithDistance;
  className?: string;
}

/**
 * Truncates a description to a maximum length, adding ellipsis if needed.
 */
export function truncateDescription(
  description: string | null,
  maxLength: number = 150
): string | null {
  if (!description) return null;
  if (description.length <= maxLength) return description;
  return description.slice(0, maxLength) + "...";
}

export function OfferCard({ offer, className }: OfferCardProps) {
  const truncatedDescription = truncateDescription(offer.description);

  return (
    <Link
      href={`/offers/${offer.id}`}
      className={cn(
        "block min-h-[44px] rounded-lg border border-border bg-card p-4 shadow-sm",
        "transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "active:bg-accent",
        className
      )}
      aria-label={`${offer.dishName} - ${offer.restaurantName}, ${offer.price} PLN`}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold leading-tight text-card-foreground line-clamp-2">
            {offer.dishName}
          </h3>
          <span className="shrink-0 text-base font-bold text-primary whitespace-nowrap">
            {offer.price.toFixed(2)} PLN
          </span>
        </div>

        <p className="text-sm text-muted-foreground">{offer.restaurantName}</p>

        {truncatedDescription && (
          <p className="text-sm text-muted-foreground/80 leading-relaxed">
            {truncatedDescription}
          </p>
        )}

        {offer.items.length > 0 && (
          <p className="text-xs text-muted-foreground/70 leading-relaxed">
            {offer.items.join(", ")}
          </p>
        )}

        {offer.distanceKm !== null && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{offer.distanceKm.toFixed(1)} km</span>
          </div>
        )}
      </div>
    </Link>
  );
}
