"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { contributionLink, isNavActive } from "@/lib/nav-links";
import { cn } from "@/lib/utils";

/** The contribution action remains a navigation destination in both layouts. */
export function AddOfferLink({ className }: { className?: string }) {
  const active = isNavActive(usePathname(), contributionLink.href);
  return (
    <Button asChild className={cn("min-h-[44px]", className,
      active && "bg-primary/80 ring-2 ring-primary ring-offset-2 ring-offset-background")}>
      <Link href={contributionLink.href} aria-current={active ? "page" : undefined}>
        <Plus data-icon="inline-start" />{contributionLink.label}
      </Link>
    </Button>
  );
}
