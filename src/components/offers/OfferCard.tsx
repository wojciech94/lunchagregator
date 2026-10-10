import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import type { LunchOfferWithDistance, CuisineType, DietaryTag } from "@/types/offers";

interface OfferCardProps { offer: LunchOfferWithDistance; className?: string; }
const cuisines: Record<CuisineType, string> = {
  polska: "Polska", wloska: "Włoska", azjatycka: "Azjatycka", meksykanska: "Meksykańska",
  amerykanska: "Amerykańska", indyjska: "Indyjska", srodziemnomorska: "Śródziemnomorska", inne: "Inna",
};
const diets: Record<DietaryTag, string> = {
  vegetarian: "Wegetariańskie", vegan: "Wegańskie", "gluten-free": "Bezglutenowe", "dairy-free": "Bez nabiału", keto: "Keto",
};
export function truncateDescription(description: string | null, maxLength = 150): string | null {
  if (!description) return null;
  return description.length <= maxLength ? description : description.slice(0, maxLength) + "...";
}
export function OfferCard({ offer, className }: OfferCardProps) {
  const description = truncateDescription(offer.description);
  const price = new Intl.NumberFormat("pl-PL", { style: "currency", currency: offer.currency || "PLN" }).format(offer.price);
  return (
    <Card className={cn("h-full", className)}>
      <CardHeader>
        {offer.cuisineType && <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{cuisines[offer.cuisineType]}</p>}
        <CardTitle><h3>{offer.dishName}</h3></CardTitle>
        <CardDescription>{offer.restaurantName}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}
        {offer.items.length > 0 && <p className="text-sm leading-relaxed text-muted-foreground">{offer.items.join(" · ")}</p>}
        {offer.dietaryTags.length > 0 && <div className="flex flex-wrap gap-2">{offer.dietaryTags.map(tag => <Badge key={tag} variant="secondary">{diets[tag]}</Badge>)}</div>}
      </CardContent>
      <CardFooter className="mt-auto flex-col items-stretch gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <span className="text-2xl font-bold tracking-tight tabular-nums">{price}</span>
          {offer.distanceKm !== null && <span className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-4" aria-hidden="true" />{offer.distanceKm.toLocaleString("pl-PL", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km</span>}
        </div>
        <Button variant="outline" asChild>
          <Link href={`/offers/${offer.id}`} aria-label={`${offer.dishName} - ${offer.restaurantName}, ${offer.price} PLN`}>
            Zobacz ofertę <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}