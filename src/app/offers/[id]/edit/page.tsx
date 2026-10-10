"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getOfferWithAccessAction, updateOfferAction } from "@/actions/offers";
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

      // The offer and the permission arrive together. This page is a client
      // component, so it cannot call `getUser()` -- that reads `next/headers` and
      // does not compile here -- and the answer has to come over a server action.
      const result = await getOfferWithAccessAction(id);

      if (cancelled) return;

      if (!result.success) {
        setState({ status: "not_found" });
        return;
      }

      // The `forbidden` branch below used to be unreachable: declared and
      // rendered, never set. Authorisation lives in `updateOfferAction` and stays
      // there -- this is the same check one step earlier, so somebody who cannot
      // save is told before they type anything, rather than after.
      if (!result.data.canModify) {
        setState({ status: "forbidden" });
        return;
      }

      setState({ status: "ready", offer: result.data.offer });
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
  const [items, setItems] = React.useState<string[]>([...(offer.items ?? [])]);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [locationWarning, setLocationWarning] = React.useState(false);

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
    setLocationWarning(false);

    const parsedPrice = Number.parseFloat(price);

    const data = {
      dishName: dishName.trim(),
      price: parsedPrice,
      restaurantName: restaurantName.trim(),
      availableDate,
      sourceType: offer.sourceType,
      items: items.filter((item) => item.trim().length > 0),
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
      if (result.locationWarning) {
        setLocationWarning(true);
        setIsSubmitting(false);
        return;
      }
      onSuccess();
      return;
    }

    if (result.fieldErrors) setFieldErrors(result.fieldErrors);
    setFormError(result.error);
    setIsSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {locationWarning && (
        <div role="status" className="rounded-md border border-border p-4 space-y-2">
          <p className="text-sm">Zapisano ofertę, ale nie udało się ustalić współrzędnych adresu. Oferta nie będzie widoczna w wyszukiwaniu po odległości.</p>
          <Button type="button" variant="outline" onClick={onSuccess}>Przejdź do oferty</Button>
        </div>
      )}
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
          aria-describedby={fieldErrors["dishName"] ? "offer-dishName-error" : undefined}
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
          aria-describedby={fieldErrors["price"] ? "offer-price-error" : undefined}
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
          aria-describedby={fieldErrors["restaurantName"] ? "offer-restaurantName-error" : undefined}
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
          aria-describedby={fieldErrors["availableDate"] ? "offer-availableDate-error" : undefined}
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
          aria-describedby={fieldErrors["description"] ? "offer-description-error" : undefined}
        />
      </FormField>

      {/* Items */}
      <FormField label="Skład zestawu" error={fieldErrors["items"]} isOptional>
        {items.map((item, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Label htmlFor={`offer-item-${index}`}>Pozycja zestawu {index + 1}</Label>
              <Input
                id={`offer-item-${index}`}
                value={item}
                maxLength={200}
                onChange={(event) => setItems(items.map((value, i) => i === index ? event.target.value : value))}
                aria-invalid={!!fieldErrors[`items.${index}`]}
                aria-describedby={fieldErrors[`items.${index}`] ? `offer-item-${index}-error` : undefined}
              />
              {fieldErrors[`items.${index}`] && <p id={`offer-item-${index}-error`} role="alert" className="text-xs text-destructive">{fieldErrors[`items.${index}`]}</p>}
            </div>
            <Button type="button" variant="outline" aria-label={`Usuń pozycję ${index + 1}`} onClick={() => setItems(items.filter((_, i) => i !== index))}>Usuń</Button>
          </div>
        ))}
        <Button type="button" variant="outline" className="self-start" disabled={items.length >= 10} onClick={() => setItems([...items, ''])}>Dodaj pozycję</Button>
        <p className="text-xs text-muted-foreground">
          Wpisz każdą pozycję osobno. Przecinki i cudzysłowy pozostają częścią pozycji.
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
          aria-describedby={fieldErrors["restaurantAddress"] ? "offer-restaurantAddress-error" : undefined}
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
      <Button
        type="submit"
        disabled={isSubmitting}
        className="mt-2 self-start"
      >
        {isSubmitting ? "Zapisywanie..." : "Zapisz zmiany"}
      </Button>
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
      <Label htmlFor={htmlFor} className="flex-wrap text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
        {isOptional && (
          <span className="font-normal normal-case tracking-normal ml-1.5 text-muted-foreground">
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
