"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PrefilledOffer } from "@/lib/validations/extraction";

// ============================================================================
// Types
// ============================================================================

export interface OfferPreviewProps {
  offer: PrefilledOffer;
  sourceType: "link" | "text" | "photo";
  confidence: number;
  onEdit: () => void;
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const CUISINE_LABELS: Record<string, string> = {
  polska: "Polska",
  wloska: "Włoska",
  azjatycka: "Azjatycka",
  meksykanska: "Meksykańska",
  amerykanska: "Amerykańska",
  indyjska: "Indyjska",
  srodziemnomorska: "Śródziemnomorska",
  inne: "Inne",
};

const DIETARY_LABELS: Record<string, string> = {
  vegetarian: "Wegetariańskie",
  vegan: "Wegańskie",
  "gluten-free": "Bezglutenowe",
  "dairy-free": "Bez nabiału",
  keto: "Keto",
};

const ALLERGEN_LABELS: Record<string, string> = {
  gluten: "Gluten",
  orzechy: "Orzechy",
  mleko: "Mleko",
  jaja: "Jaja",
  ryby: "Ryby",
  skorupiaki: "Skorupiaki",
  soja: "Soja",
  seler: "Seler",
  gorczyca: "Gorczyca",
  sezam: "Sezam",
};

// ============================================================================
// Component
// ============================================================================

export function OfferPreview({
  offer,
  sourceType,
  confidence,
  onEdit,
  className,
}: OfferPreviewProps) {
  const hasMissingFields = offer.missingFields.length > 0;
  const confidencePercent = Math.round(confidence * 100);

  return (
    <Card className={cn("relative", className)}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">Podgląd wyekstrahowanej oferty</CardTitle>
          <ConfidenceBadge percent={confidencePercent} />
        </div>
        {hasMissingFields && (
          <div className="flex items-center gap-2 mt-2 text-sm text-warning-foreground">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <span>
              Brakujące pola wymagają uzupełnienia przed publikacją
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Restaurant info */}
        <PreviewField
          label="Restauracja"
          value={offer.restaurantName}
          isMissing={offer.missingFields.some((f) => f.includes("restaurantName"))}
        />

        <PreviewField
          label="Adres"
          value={offer.address || null}
          isMissing={false}
          isOptional
        />

        {/* Dishes */}
        {offer.dishes.length > 0 ? (
          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium text-foreground">Dania</span>
            {offer.dishes.map((dish, index) => (
              <div
                key={index}
                className="rounded-lg border border-border p-3 flex flex-col gap-2"
              >
                <PreviewField
                  label="Nazwa dania"
                  value={dish.name}
                  isMissing={dish.missingFields.some((f) => f.includes("dishName"))}
                />
                <PreviewField
                  label="Cena"
                  value={dish.price !== null ? `${dish.price.toFixed(2)} PLN` : null}
                  isMissing={dish.missingFields.some((f) => f.includes("price"))}
                />
                {dish.description && (
                  <PreviewField
                    label="Opis"
                    value={dish.description}
                    isMissing={false}
                    isOptional
                  />
                )}
                {dish.items.length > 0 && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">Skład zestawu</span>
                    <span className="text-sm text-foreground">{dish.items.join(", ")}</span>
                  </div>
                )}
                {dish.dietaryTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {dish.dietaryTags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {DIETARY_LABELS[tag] || tag}
                      </Badge>
                    ))}
                  </div>
                )}
                {dish.allergens.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {dish.allergens.map((allergen) => (
                      <Badge key={allergen} variant="outline" className="text-xs">
                        {ALLERGEN_LABELS[allergen] || allergen}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-warning-border p-3 text-sm text-warning-foreground">
            <AlertTriangle className="inline size-4 mr-1" aria-hidden="true" />
            Nie wykryto żadnych dań — uzupełnij ręcznie
          </div>
        )}

        {/* Source type */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Źródło:</span>
          <Badge variant="outline" className="text-xs">
            {sourceType === "link" ? "Link" : sourceType === "text" ? "Tekst" : "Zdjęcie"}
          </Badge>
        </div>

        {/* Action button */}
        <Button onClick={onEdit} className="self-start mt-2">
          <Pencil className="size-4" aria-hidden="true" />
          Edytuj i potwierdź
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function ConfidenceBadge({ percent }: { percent: number }) {
  const variant = percent >= 80 ? "default" : percent >= 50 ? "secondary" : "destructive";

  return (
    <Badge variant={variant} className="text-xs">
      <CheckCircle2 className="size-3" aria-hidden="true" />
      {percent}% pewności
    </Badge>
  );
}

function PreviewField({
  label,
  value,
  isMissing,
  isOptional = false,
}: {
  label: string;
  value: string | null;
  isMissing: boolean;
  isOptional?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">
        {label}
        {isOptional && <span className="ml-1 italic">(opcjonalne)</span>}
      </span>
      {isMissing ? (
        <span
          className="inline-flex items-center gap-1 rounded-md border-2 border-dashed border-warning-border bg-warning px-2 py-1 text-sm text-warning-foreground"
        >
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
          Brak danych — wymagane uzupełnienie
        </span>
      ) : value ? (
        <span className="text-sm text-foreground">{value}</span>
      ) : (
        <span className="text-sm text-muted-foreground italic">—</span>
      )}
    </div>
  );
}
