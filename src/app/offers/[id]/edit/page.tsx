"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getOfferById, updateOfferAction } from "@/actions/offers";
import { updateOfferSchema } from "@/lib/validations/offer";
import type { LunchOffer, CuisineType, DietaryTag, Allergen } from "@/types/offers";

// ============================================================================
// Constants
// ============================================================================

const CUISINE_OPTIONS: { value: CuisineType; label: string }[] = [
  { value: "polska", label: "Polska" },
  { value: "wloska", label: "Włoska" },
  { value: "azjatycka", label: "Azjatycka" },
  { value: "meksykanska", label: "Meksykańska" },
  { value: "amerykanska", label: "Amerykańska" },
  { value: "indyjska", label: "Indyjska" },
  { value: "srodziemnomorska", label: "Śródziemnomorska" },
  { value: "inne", label: "Inne" },
];

const DIETARY_OPTIONS: { value: DietaryTag; label: string }[] = [
  { value: "vegetarian", label: "Wegetariańskie" },
  { value: "vegan", label: "Wegańskie" },
  { value: "gluten-free", label: "Bezglutenowe" },
  { value: "dairy-free", label: "Bez nabiału" },
  { value: "keto", label: "Keto" },
];

const ALLERGEN_OPTIONS: { value: Allergen; label: string }[] = [
  { value: "gluten", label: "Gluten" },
  { value: "orzechy", label: "Orzechy" },
  { value: "mleko", label: "Mleko" },
  { value: "jaja", label: "Jaja" },
  { value: "ryby", label: "Ryby" },
  { value: "skorupiaki", label: "Skorupiaki" },
  { value: "soja", label: "Soja" },
  { value: "seler", label: "Seler" },
  { value: "gorczyca", label: "Gorczyca" },
  { value: "sezam", label: "Sezam" },
];

// ============================================================================
// Types
// ============================================================================

interface EditOfferPageProps {
  params: Promise<{ id: string }>;
}

type LoadState =
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "ready"; offer: LunchOffer };

// ============================================================================
// Page
// ============================================================================

export default function EditOfferPage({ params }: EditOfferPageProps) {
  const router = useRouter();
  const [offerId, setOfferId] = React.useState<string | null>(null);
  const [state, setState] = React.useState<LoadState>({ status: "loading" });

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      const { id } = await params;
      if (cancelled) return;
      setOfferId(id);

      const offerResult = await getOfferById(id);

      if (cancelled) return;

      if (!offerResult.success) {
        setState({ status: "not_found" });
        return;
      }

      setState({ status: "ready", offer: offerResult.data });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [params]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="mb-4"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Powrót
        </Button>
        <h1 className="text-2xl font-bold text-foreground">Edytuj ofertę</h1>
      </div>

      {state.status === "loading" && (
        <p className="text-sm text-muted-foreground">Ładowanie...</p>
      )}

      {state.status === "not_found" && (
        <div className="rounded-[4px] border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">Nie znaleziono oferty.</p>
        </div>
      )}

      {state.status === "forbidden" && (
        <div className="rounded-[4px] border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">
            Nie masz uprawnień do edycji tej oferty.
          </p>
        </div>
      )}

      {state.status === "ready" && offerId && (
        <EditOfferForm
          offerId={offerId}
          offer={state.offer}
          onSuccess={() => router.push(`/offers/${offerId}`)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Form
// ============================================================================

function EditOfferForm({
  offerId,
  offer,
  onSuccess,
}: {
  offerId: string;
  offer: LunchOffer;
  onSuccess: () => void;
}) {
  const [dishName, setDishName] = React.useState(offer.dishName);
  const [price, setPrice] = React.useState(String(offer.price));
  const [restaurantName, setRestaurantName] = React.useState(offer.restaurantName);
  const [availableDate, setAvailableDate] = React.useState(offer.availableDate);
  const [description, setDescription] = React.useState(offer.description ?? "");
  const [cuisineType, setCuisineType] = React.useState<CuisineType | null>(
    offer.cuisineType ?? null
  );
  const [restaurantAddress, setRestaurantAddress] = React.useState(
    offer.restaurantAddress ?? ""
  );
  const [dietaryTags, setDietaryTags] = React.useState<DietaryTag[]>(
    offer.dietaryTags ?? []
  );
  const [allergens, setAllergens] = React.useState<Allergen[]>(
    offer.allergens ?? []
  );
  const [itemsText, setItemsText] = React.useState((offer.items ?? []).join(", "));

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  function toggleCuisine(value: CuisineType) {
    setCuisineType((prev) => (prev === value ? null : value));
  }

  function toggleDietary(value: DietaryTag) {
    setDietaryTags((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]
    );
  }

  function toggleAllergen(value: Allergen) {
    setAllergens((prev) =>
      prev.includes(value) ? prev.filter((a) => a !== value) : [...prev, value]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const items = itemsText
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const parsedPrice = Number.parseFloat(price);

    const data = {
      dishName: dishName.trim(),
      price: Number.isNaN(parsedPrice) ? undefined : parsedPrice,
      restaurantName: restaurantName.trim(),
      availableDate,
      sourceType: offer.sourceType,
      items,
      description: description.trim() ? description.trim() : null,
      cuisineType: cuisineType ?? null,
      dietaryTags,
      allergens,
      restaurantAddress: restaurantAddress.trim() ? restaurantAddress.trim() : null,
    };

    const validation = updateOfferSchema.safeParse(data);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      for (const issue of validation.error.issues) {
        const path = issue.path.join(".");
        if (!errors[path]) errors[path] = issue.message;
      }
      const rootErrors = validation.error.issues.filter((i) => i.path.length === 0);
      if (rootErrors.length > 0) setFormError(rootErrors[0].message);
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    const result = await updateOfferAction(offerId, validation.data);
    if (result.success) {
      onSuccess();
      return;
    }

    if (result.fieldErrors) setFieldErrors(result.fieldErrors);
    setFormError(result.error);
    setIsSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {/* Form error */}
      {formError && (
        <div className="rounded-[4px] border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        </div>
      )}

      {/* Dish name */}
      <FormField label="Nazwa dania" htmlFor="offer-dishName" error={fieldErrors["dishName"]} required>
        <Input
          id="offer-dishName"
          value={dishName}
          onChange={(e) => setDishName(e.target.value)}
          placeholder="np. Zupa pomidorowa z makaronem"
          maxLength={100}
          className="bg-card border-border focus:border-primary"
          aria-invalid={!!fieldErrors["dishName"]}
        />
      </FormField>

      {/* Price */}
      <FormField label="Cena (PLN)" htmlFor="offer-price" error={fieldErrors["price"]} required>
        <Input
          id="offer-price"
          type="number"
          step="0.01"
          min="0.01"
          max="9999.99"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="np. 25.00"
          className="bg-card border-border focus:border-primary"
          aria-invalid={!!fieldErrors["price"]}
        />
      </FormField>

      {/* Restaurant name */}
      <FormField label="Nazwa restauracji" htmlFor="offer-restaurantName" error={fieldErrors["restaurantName"]} required>
        <Input
          id="offer-restaurantName"
          value={restaurantName}
          onChange={(e) => setRestaurantName(e.target.value)}
          placeholder="np. Restauracja Pod Lipami"
          maxLength={100}
          className="bg-card border-border focus:border-primary"
          aria-invalid={!!fieldErrors["restaurantName"]}
        />
      </FormField>

      {/* Available date */}
      <FormField label="Data dostępności" htmlFor="offer-availableDate" error={fieldErrors["availableDate"]} required>
        <Input
          id="offer-availableDate"
          type="date"
          value={availableDate}
          onChange={(e) => setAvailableDate(e.target.value)}
          className="bg-card border-border focus:border-primary"
          aria-invalid={!!fieldErrors["availableDate"]}
        />
      </FormField>

      {/* Description */}
      <FormField label="Opis" htmlFor="offer-description" error={fieldErrors["description"]} isOptional>
        <Textarea
          id="offer-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Krótki opis dania"
          maxLength={500}
          rows={3}
          className="bg-card border-border focus:border-primary resize-none"
          aria-invalid={!!fieldErrors["description"]}
        />
      </FormField>

      {/* Items */}
      <FormField label="Skład zestawu" htmlFor="offer-items" error={fieldErrors["items"]} isOptional>
        <Input
          id="offer-items"
          value={itemsText}
          onChange={(e) => setItemsText(e.target.value)}
          placeholder="np. zupa, drugie danie, deser (oddziel przecinkami)"
          className="bg-card border-border focus:border-primary"
          aria-invalid={!!fieldErrors["items"]}
        />
        <p className="text-xs text-muted-foreground/60">
          Oddziel poszczególne pozycje przecinkami.
        </p>
      </FormField>

      {/* Cuisine type */}
      <FormField label="Typ kuchni" error={fieldErrors["cuisineType"]} isOptional>
        <div className="flex flex-wrap gap-2">
          {CUISINE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => toggleCuisine(option.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                cuisineType === option.value
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/20 hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </FormField>

      {/* Restaurant address */}
      <FormField label="Adres restauracji" htmlFor="offer-restaurantAddress" error={fieldErrors["restaurantAddress"]} isOptional>
        <Input
          id="offer-restaurantAddress"
          value={restaurantAddress}
          onChange={(e) => setRestaurantAddress(e.target.value)}
          placeholder="np. ul. Marszałkowska 10, Warszawa"
          maxLength={200}
          className="bg-card border-border focus:border-primary"
          aria-invalid={!!fieldErrors["restaurantAddress"]}
        />
      </FormField>

      {/* Dietary tags */}
      <FormField label="Tagi dietetyczne" error={fieldErrors["dietaryTags"]} isOptional>
        <div className="flex flex-wrap gap-2">
          {DIETARY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => toggleDietary(option.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                dietaryTags.includes(option.value)
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/20 hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </FormField>

      {/* Allergens */}
      <FormField label="Alergeny" error={fieldErrors["allergens"]} isOptional>
        <div className="flex flex-wrap gap-2">
          {ALLERGEN_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => toggleAllergen(option.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                allergens.includes(option.value)
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/20 hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </FormField>

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="self-start mt-2 inline-flex min-h-[48px] items-center rounded-[4px] bg-primary px-6 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-[#5e6ad2] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {isSubmitting ? "Zapisywanie..." : "Zapisz zmiany"}
      </button>
    </form>
  );
}

// ============================================================================
// FormField
// ============================================================================

function FormField({
  label,
  htmlFor,
  error,
  isOptional = false,
  required = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  isOptional?: boolean;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor} className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
        {isOptional && (
          <span className="font-normal normal-case tracking-normal ml-1.5 text-muted-foreground/60">
            (opcjonalne)
          </span>
        )}
      </Label>
      {children}
      {error && (
        <p
          id={htmlFor ? `${htmlFor}-error` : undefined}
          className="text-xs text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
