"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { OfferCard } from "./OfferCard";
import type { LunchOfferWithDistance } from "@/types/offers";

interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

interface OfferListProps {
  offers: LunchOfferWithDistance[];
  pagination: PaginationInfo;
  onPageChange?: (page: number) => void;
  className?: string;
}

export function OfferList({
  offers,
  pagination,
  onPageChange,
  className,
}: OfferListProps) {
  const { page, hasMore } = pagination;
  const showPagination = hasMore || page > 1;

  if (offers.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div
        className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3"
        role="list"
        aria-label="Lista ofert lunchowych"
      >
        {offers.map((offer) => (
          <div key={offer.id} role="listitem">
            <OfferCard offer={offer} />
          </div>
        ))}
      </div>

      {showPagination && (
        <nav
          className="flex items-center justify-center gap-2"
          aria-label="Paginacja"
        >
          <button
            type="button"
            onClick={() => onPageChange?.(page - 1)}
            disabled={page <= 1}
            className={cn(
              "inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-md border border-border px-3 py-2 text-sm font-medium",
              "transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:pointer-events-none disabled:opacity-50"
            )}
            aria-label="Poprzednia strona"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Poprzednia</span>
          </button>

          <span className="text-sm text-muted-foreground px-2">
            Strona {page}
          </span>

          <button
            type="button"
            onClick={() => onPageChange?.(page + 1)}
            disabled={!hasMore}
            className={cn(
              "inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-md border border-border px-3 py-2 text-sm font-medium",
              "transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:pointer-events-none disabled:opacity-50"
            )}
            aria-label="Następna strona"
          >
            <span className="hidden sm:inline">Następna</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}
