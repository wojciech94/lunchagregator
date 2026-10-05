"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RestaurantCard } from "./RestaurantCard";
import type { PaginatedRestaurants } from "@/types/restaurants";

interface RestaurantListProps {
  data: PaginatedRestaurants;
  hasActiveFilters?: boolean;
  onPageChange?: (page: number) => void;
  className?: string;
}

export function RestaurantList({
  data,
  hasActiveFilters,
  onPageChange,
  className,
}: RestaurantListProps) {
  const { restaurants, page, hasMore } = data;
  const showPagination = hasMore || page > 1;

  if (restaurants.length === 0) {
    if (hasActiveFilters) {
      return (
        <div className={cn("py-16 text-center", className)}>
          <p className="text-base text-muted-foreground">
            Brak restauracji spełniających kryteria.
          </p>
          <p className="mt-1 text-sm text-muted-foreground/60">
            Spróbuj zmienić lub wyczyścić filtry.
          </p>
        </div>
      );
    }

    return (
      <div className={cn("py-16 text-center", className)}>
        <p className="text-base text-muted-foreground">
          Brak restauracji. Dodaj pierwszą!
        </p>
        <Link
          href="/restaurants/new"
          className={cn(buttonVariants(), "mt-4 min-h-[48px] px-6")}
        >
          <Plus className="size-4" aria-hidden="true" />
          Dodaj restaurację
        </Link>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div
        className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        role="list"
        aria-label="Lista restauracji"
      >
        {restaurants.map((restaurant) => (
          <div key={restaurant.id} role="listitem">
            <RestaurantCard restaurant={restaurant} />
          </div>
        ))}
      </div>

      {showPagination && (
        <nav
          className="flex items-center justify-center gap-3 pt-4 border-t border-border"
          aria-label="Paginacja"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange?.(page - 1)}
            disabled={page <= 1}
            aria-label="Poprzednia strona"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Poprzednia</span>
          </Button>

          <span className="text-sm text-muted-foreground tabular-nums px-2">
            Strona {page}
          </span>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange?.(page + 1)}
            disabled={!hasMore}
            aria-label="Następna strona"
          >
            <span className="hidden sm:inline">Następna</span>
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </nav>
      )}
    </div>
  );
}
