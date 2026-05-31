import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Pencil, Trash2, MapPin, Calendar, Utensils, Tag } from 'lucide-react';

import { getOfferById } from '@/actions/offers';
import { getUser } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface OfferDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default async function OfferDetailsPage({ params }: OfferDetailsPageProps) {
  const { id } = await params;
  const result = await getOfferById(id);

  if (!result.success) {
    notFound();
  }

  const offer = result.data;
  const user = await getUser();
  const isOwner = user !== null && offer.userId !== null && user.id === offer.userId;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      {/* Back button */}
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-6">
        <ArrowLeft className="size-4" />
        Powrót do listy ofert
      </Link>

      <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-2xl md:text-3xl">{offer.dishName}</CardTitle>
                <p className="text-lg font-semibold text-primary">
                  {offer.price.toFixed(2)} {offer.currency}
                </p>
              </div>

              {/* Edit/Delete buttons - only visible to owner */}
              {isOwner && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/offers/${offer.id}/edit`}>
                      <Pencil className="size-4" />
                      Edytuj
                    </Link>
                  </Button>
                  <Button variant="destructive" size="sm" asChild>
                    <Link href={`/offers/${offer.id}/delete`}>
                      <Trash2 className="size-4" />
                      Usuń
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Description */}
            {offer.description && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground mb-1">Opis</h2>
                <p className="text-base">{offer.description}</p>
              </section>
            )}

            {/* Set items */}
            {offer.items.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground mb-2">Skład zestawu</h2>
                <ul className="list-disc list-inside space-y-1">
                  {offer.items.map((item, index) => (
                    <li key={index} className="text-base">{item}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* Restaurant info */}
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground mb-1">Restauracja</h2>
              <div className="flex items-center gap-2">
                <Utensils className="size-4 text-muted-foreground" />
                <span className="text-base font-medium">{offer.restaurantName}</span>
              </div>
              {offer.restaurantAddress && (
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 text-muted-foreground" />
                  <span className="text-base">{offer.restaurantAddress}</span>
                </div>
              )}
            </section>

            {/* Cuisine type */}
            {offer.cuisineType && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground mb-1">Typ kuchni</h2>
                <Badge variant="secondary" className="capitalize">
                  {offer.cuisineType}
                </Badge>
              </section>
            )}

            {/* Dietary tags */}
            {offer.dietaryTags.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground mb-2">Tagi dietetyczne</h2>
                <div className="flex flex-wrap gap-2">
                  {offer.dietaryTags.map((tag) => (
                    <Badge key={tag} variant="default">
                      <Tag className="size-3" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            {/* Allergens */}
            {offer.allergens.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground mb-2">Alergeny</h2>
                <div className="flex flex-wrap gap-2">
                  {offer.allergens.map((allergen) => (
                    <Badge key={allergen} variant="outline">
                      {allergen}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            {/* Date and source */}
            <section className="flex flex-col gap-2 border-t pt-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="size-4" />
                <span>Dostępne: {new Date(offer.availableDate).toLocaleDateString('pl-PL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </div>
              <div className="flex items-center gap-2">
                <Tag className="size-4" />
                <span>Źródło: {offer.sourceType === 'link' ? 'Link' : offer.sourceType === 'text' ? 'Tekst' : 'Zdjęcie'}</span>
              </div>
            </section>
          </CardContent>
        </Card>
    </div>
  );
}
