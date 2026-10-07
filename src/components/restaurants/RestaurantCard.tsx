import { cuisineLabels } from '@/lib/display-labels';
import Link from "next/link";
import { Clock, MapPin } from "lucide-react";
import { formatLunchHours } from "@/utils/lunch-hours-formatter";
import type { RestaurantWithDistance } from "@/types/restaurants";

interface RestaurantCardProps {
  restaurant: RestaurantWithDistance;
  className?: string;
}

const priceLevelLabels: Record<string, string> = {
  budżetowa: "Budżetowa",
  średnia: "Średnia",
  premium: "Premium",
};

const priceLevelColors: Record<string, string> = {
  budżetowa: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  średnia: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  premium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

export function RestaurantCard({ restaurant, className }: RestaurantCardProps) {
  return (
    <Link
      href={`/restaurants/${restaurant.id}`}
      className={`group block rounded-md border border-border bg-card p-4 shadow-[0_1.2px_0_0_rgba(0,0,0,0.03)] transition-all duration-200 hover:brightness-105 hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className ?? ""}`}
      aria-label={`${restaurant.name}${restaurant.priceLevel ? `, ${priceLevelLabels[restaurant.priceLevel]}` : ""}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-base font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
          {restaurant.name}
        </h3>
        {restaurant.priceLevel && (
          <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${priceLevelColors[restaurant.priceLevel]}`}>
            {priceLevelLabels[restaurant.priceLevel]}
          </span>
        )}
      </div>

      {/* Cuisine tags */}
      {restaurant.cuisineTypes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {restaurant.cuisineTypes.map((cuisine) => (
            <span
              key={cuisine}
              className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground"
            >
              {cuisineLabels[cuisine]}
            </span>
          ))}
        </div>
      )}

      {/* Meta info */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        {restaurant.lunchHours && (
          <div className="flex items-center gap-1.5">
            <Clock className="size-3.5 shrink-0" aria-hidden="true" />
            <span>{formatLunchHours(restaurant.lunchHours)}</span>
          </div>
        )}

        {restaurant.distanceKm !== null && (
          <div className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span>{restaurant.distanceKm.toFixed(1)} km</span>
          </div>
        )}
      </div>
    </Link>
  );
}
