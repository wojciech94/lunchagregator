import Link from "next/link";
import { AlertTriangle, Calendar, MapPin, Pencil, Utensils } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteOfferButton } from "@/components/offers/DeleteOfferButton";
import { RestoreOfferLocationButton } from "@/components/offers/RestoreOfferLocationButton";
import type { LunchOffer } from "@/types/offers";

interface OrphanOfferRowProps {
  offer: LunchOffer;
}

/**
 * One ownerless offer, as the admin sees it in the cleanup panel.
 *
 * A separate component rather than a variant of `OfferCard`, and the reason is
 * what each one is for. `OfferCard` answers "tap this to see the meal", so it is
 * one big link and everything else is a line of text inside it. This row answers
 * "here is a record with nobody's name on it, do something about it", which
 * means three separate destinations and two of them are destructive. Nesting
 * links inside the card's link is not valid HTML, and flattening the card into a
 * plain container would change the public list to suit an admin page.
 *
 * So the shared part is the data, not the markup: both read the same mapped row.
 *
 * The address and the coordinate state are here because they are what an operator
 * is actually deciding on. #17/#18 made a missing geocode a real outcome rather
 * than a failure, and "this offer has an address but never got coordinates" is the
 * single most common thing to want to fix in this list.
 */
export function OrphanOfferRow({ offer }: OrphanOfferRowProps) {
  const hasAddress = Boolean(offer.restaurantAddress?.trim());
  const hasCoordinates = offer.restaurantLocation !== null;

  return (
    <li className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold leading-tight text-card-foreground">
            {offer.dishName}
          </h3>
          <span className="shrink-0 whitespace-nowrap text-base font-bold text-primary">
            {offer.price.toFixed(2)} {offer.currency}
          </span>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Utensils className="size-4 shrink-0" aria-hidden="true" />
          {/* The detail page, not the card's whole-surface link: this row has
              three destinations and only one of them is "read". */}
          <Link
            href={`/offers/${offer.id}`}
            className="truncate underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {offer.restaurantName}
          </Link>
        </div>

        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {hasAddress ? (
            <span className="min-w-0 break-words">{offer.restaurantAddress}</span>
          ) : (
            <span className="italic">brak adresu</span>
          )}
        </div>

        {/* Two states, never one. An offer with an address and no coordinates is a
            different problem from one with neither, and collapsing them into "no
            location" would hide the case an operator can act on. */}
        {hasAddress && !hasCoordinates && (
          <Badge variant="outline" className="w-fit gap-1">
            <AlertTriangle className="size-3" aria-hidden="true" />
            Brak współrzędnych
          </Badge>
        )}

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="size-4 shrink-0" aria-hidden="true" />
          <span>{describeAvailability(offer.availableDate)}</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {offer.restaurantId && (!hasAddress || !hasCoordinates) && (
          <RestoreOfferLocationButton offerId={offer.id} />
        )}
        <Button variant="outline" size="sm" asChild>
          <Link href={`/offers/${offer.id}/edit`}>
            <Pencil className="size-4" aria-hidden="true" />
            Edytuj
          </Link>
        </Button>
        {/* No `redirectTo`: the operator stays on the panel and the row leaves it
            once the dialog closes. Navigating away first would put them on the
            public list, which is where the old flow used to dump them. */}
        <DeleteOfferButton
          offer={{
            id: offer.id,
            dishName: offer.dishName,
            restaurantName: offer.restaurantName,
            price: offer.price,
            currency: offer.currency,
            hasOwner: offer.userId !== null,
          }}
        />
      </div>
    </li>
  );
}

/**
 * How the offer's date reads to the person deciding whether to keep it.
 *
 * "Dostępne: niedzisiaj, 4 października 2026" -- the same wording the detail page
 * uses, so an operator comparing the two is not translating between them. Today
 * and tomorrow are called out because those are the rows still worth eating, and
 * the rest of the list is cleanup.
 */
function describeAvailability(availableDate: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${availableDate}T00:00:00`);

  if (Number.isNaN(target.getTime())) return availableDate;

  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (days === 0) return "Dostępne dziś";
  if (days === 1) return "Dostępne jutro";
  if (days < 0) return "Po terminie";

  return `Dostępne: ${target.toLocaleDateString("pl-PL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })}`;
}
