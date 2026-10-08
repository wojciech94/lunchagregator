'use client';

import { cuisineLabels } from '@/lib/display-labels';
import Link from 'next/link';
import {
  Clock,
  MapPin,
  Phone,
  Globe,
  Pencil,
  UtensilsCrossed,
  ArrowLeft,
  Plus,
} from 'lucide-react';

import { DeleteRestaurantButton } from './DeleteRestaurantButton';
import { Button } from '@/components/ui/button';
import { formatLunchHours } from '@/utils/lunch-hours-formatter';
import type { RestaurantWithDistance } from '@/types/restaurants';
import type { LunchOffer } from '@/types/offers';

interface RestaurantDetailProps {
  restaurant: RestaurantWithDistance;
  /**
   * Decided on the server by `capabilitiesFor`. Not a user id for the client to
   * compare against: RLS filters a row out silently and returns no error, so a
   * client that derives its own answer can disagree with the database and never
   * find out.
   */
  canEdit: boolean;
  canDelete: boolean;
  offers?: LunchOffer[];
}

const priceLevelLabels: Record<string, string> = {
  budżetowa: 'Budżetowa',
  średnia: 'Średnia',
  premium: 'Premium',
};

const priceLevelColors: Record<string, string> = {
  budżetowa: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  średnia: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  premium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

export function RestaurantDetail({ restaurant, canEdit, canDelete, offers = [] }: RestaurantDetailProps) {
  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <Link
        href="/restaurants"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowLeft className="size-4" />
        Powrót do listy
      </Link>

      {/* Main card */}
      <div className="rounded-md border border-border bg-card shadow-[0_1.2px_0_0_rgba(0,0,0,0.03)]">
        {/* Header section */}
        <div className="flex flex-col gap-4 border-b border-border p-6 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              {restaurant.name}
            </h1>
            <div className="flex items-center gap-3">
              {restaurant.priceLevel && (
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${priceLevelColors[restaurant.priceLevel]}`}>
                  {priceLevelLabels[restaurant.priceLevel]}
                </span>
              )}
              {restaurant.activeOffersCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <UtensilsCrossed className="size-3.5" aria-hidden="true" />
                  {restaurant.activeOffersCount} aktywn{restaurant.activeOffersCount === 1 ? 'a' : restaurant.activeOffersCount < 5 ? 'e' : 'ych'} ofer{restaurant.activeOffersCount === 1 ? 'ta' : restaurant.activeOffersCount < 5 ? 'ty' : 't'}
                </span>
              )}
            </div>
          </div>

          {/* Record actions — an owner, or an admin who may act on anything. */}
          {(canEdit || canDelete) && (
            <div className="flex gap-2">
              {canEdit && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="rounded-[4px] border-muted-foreground/30 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Link href={`/restaurants/${restaurant.id}/edit`}>
                    <Pencil className="size-3.5" />
                    Edytuj
                  </Link>
                </Button>
              )}
              {canDelete && (
                <DeleteRestaurantButton
                  redirectTo="/restaurants"
                  restaurant={{
                    id: restaurant.id,
                    name: restaurant.name,
                    address: restaurant.address ?? null,
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* Content grid */}
        <div className="grid gap-0 md:grid-cols-2">
          {/* Left column — main info */}
          <div className="space-y-5 p-6 md:border-r md:border-border">
            {/* Description */}
            {restaurant.description && (
              <section>
                <h2 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Opis
                </h2>
                <p className="text-base leading-relaxed text-foreground">
                  {restaurant.description}
                </p>
              </section>
            )}

            {/* Address */}
            {restaurant.address && (
              <section>
                <h2 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Adres
                </h2>
                <div className="flex items-center gap-2 text-foreground">
                  <MapPin className="size-4 text-primary shrink-0" aria-hidden="true" />
                  <span>{restaurant.address}</span>
                </div>
              </section>
            )}

            {/* Lunch hours */}
            {restaurant.lunchHours && (
              <section>
                <h2 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Godziny lunchowe
                </h2>
                <div className="flex items-center gap-2 text-foreground">
                  <Clock className="size-4 text-primary shrink-0" aria-hidden="true" />
                  <span className="font-medium">{formatLunchHours(restaurant.lunchHours)}</span>
                </div>
              </section>
            )}

            {/* Cuisine types */}
            {restaurant.cuisineTypes.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Typ kuchni
                </h2>
                <div className="flex flex-wrap gap-2">
                  {restaurant.cuisineTypes.map((cuisine) => (
                    <span
                      key={cuisine}
                      className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary"
                    >
                      {cuisineLabels[cuisine]}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right column — contact & meta */}
          <div className="space-y-5 p-6">
            {/* Phone */}
            {restaurant.phoneNumber && (
              <section>
                <h2 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Telefon
                </h2>
                <div className="flex items-center gap-2">
                  <Phone className="size-4 text-primary shrink-0" aria-hidden="true" />
                  <a
                    href={`tel:${restaurant.phoneNumber}`}
                    className="text-foreground hover:text-primary transition-colors"
                  >
                    {restaurant.phoneNumber}
                  </a>
                </div>
              </section>
            )}

            {/* Website */}
            {restaurant.websiteUrl && (
              <section>
                <h2 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Strona internetowa
                </h2>
                <div className="flex items-center gap-2">
                  <Globe className="size-4 text-primary shrink-0" aria-hidden="true" />
                  <a
                    href={restaurant.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-4 hover:text-primary/80 break-all text-sm"
                  >
                    {restaurant.websiteUrl}
                  </a>
                </div>
              </section>
            )}

            {/* Distance */}
            {restaurant.distanceKm !== null && (
              <section>
                <h2 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Odległość
                </h2>
                <div className="flex items-center gap-2 text-foreground">
                  <MapPin className="size-4 text-primary shrink-0" aria-hidden="true" />
                  <span className="font-medium">{restaurant.distanceKm.toFixed(1)} km</span>
                </div>
              </section>
            )}

            {/* No contact info fallback */}
            {!restaurant.phoneNumber && !restaurant.websiteUrl && !restaurant.distanceKm && (
              <p className="text-sm text-muted-foreground italic">
                Brak dodatkowych informacji kontaktowych.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Associated offers */}
      <div className="rounded-md border border-border bg-card shadow-[0_1.2px_0_0_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between gap-2 border-b border-border p-5">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="size-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              Aktywne oferty
            </h2>
          </div>
          <Link
            href={`/add?restaurantId=${restaurant.id}`}
            className="inline-flex items-center gap-1.5 rounded-[4px] bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-[#5e6ad2]"
          >
            <Plus className="size-3.5" />
            Dodaj ofertę
          </Link>
        </div>

        {offers.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            Brak aktywnych ofert dla tej restauracji.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {offers.map((offer) => (
              <li key={offer.id}>
                <Link
                  href={`/offers/${offer.id}`}
                  className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {offer.dishName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(offer.availableDate + 'T00:00:00').toLocaleDateString('pl-PL', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-primary">
                    {offer.price.toFixed(2)} {offer.currency}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
