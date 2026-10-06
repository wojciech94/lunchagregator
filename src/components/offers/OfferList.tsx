"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange?.(page - 1)}
            disabled={page <= 1}
            aria-label="Poprzednia strona"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Poprzednia</span>
          </Button>

          <span className="text-sm text-muted-foreground px-2">
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
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </nav>
      )}
    </div>
  );
}
