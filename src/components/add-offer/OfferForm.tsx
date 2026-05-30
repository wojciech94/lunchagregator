"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  createOfferSchema,
  type CreateOfferInput,
} from "@/lib/validations/offer";
import type { PrefilledOffer } from "@/lib/validations/extraction";
import type { CuisineType, DietaryTag, Allergen } from "@/types/offers";
import { RestaurantSelect } from "@/components/restaurants/RestaurantSelect";
import type { RestaurantSummary } from "@/types/restaurants";

// ============================================================================
// Types
// ============================================================================

export interface OfferFormProps {
  prefilledData: PrefilledOffer;
  sourceType: "link" | "text" | "photo";
  onSubmit: (data: CreateOfferInput) => void;
  isSubmitting?: boolean;
  className?: string;
}

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
// Helpers
// ============================================================================

function getTodayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function buildDefaultValues(
  prefilledData: PrefilledOffer,
  sourceType: "link" | "text" | "photo"
): Partial<CreateOfferInput> {
  const firstDish = prefilledData.dishes[0];

  return {
    dishName: firstDish?.name ?? "",
    price: firstDish?.price ?? undefined,
    restaurantName: prefilledData.restaurantName ?? "",
    availableDate: getTodayISO(),
    sourceType,
    description: firstDish?.description ?? "",
    items: firstDish?.items ?? [],
    cuisineType: undefined,
    dietaryTags: firstDish?.dietaryTags ?? [],
    allergens: firstDish?.allergens ?? [],
    restaurantAddress: prefilledData.address ?? "",
  };
}

// ============================================================================
// Component
// ============================================================================

export function OfferForm({
  prefilledData,
  sourceType,
  onSubmit,
  isSubmitting = false,
  className,
}: OfferFormProps) {
  const missingFields = prefilledData.missingFields;
  const [selectedRestaurantId, setSelectedRestaurantId] = React.useState<string | undefined>(undefined);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateOfferInput>({
    resolver: zodResolver(createOfferSchema),
    defaultValues: buildDefaultValues(prefilledData, sourceType),
  });

  const dietaryTags = watch("dietaryTags") ?? [];
  const allergens = watch("allergens") ?? [];
  const cuisineType = watch("cuisineType");
  const items = watch("items") ?? [];

  function handleRestaurantSelect(restaurant: RestaurantSummary | null) {
    if (restaurant) {
      setSelectedRestaurantId(restaurant.id);
      setValue("restaurantName", restaurant.name, { shouldValidate: true });
      setValue("restaurantAddress", restaurant.address ?? "", { shouldValidate: true });
      setValue("restaurantId", restaurant.id, { shouldValidate: true });
    } else {
      setSelectedRestaurantId(undefined);
      setValue("restaurantName", "", { shouldValidate: true });
      setValue("restaurantAddress", "", { shouldValidate: true });
      setValue("restaurantId", undefined, { shouldValidate: true });
    }
  }

  function isMissing(fieldName: string): boolean {
    return missingFields.some((f) => f.includes(fieldName));
  }

  function handleAddItem() {
    if (items.length >= 10) return;
    setValue("items", [...items, ""], { shouldValidate: true });
  }

  function handleRemoveItem(index: number) {
    setValue(
      "items",
      items.filter((_, i) => i !== index),
      { shouldValidate: true }
    );
  }

  function handleItemChange(index: number, value: string) {
    const updated = [...items];
    updated[index] = value;
    setValue("items", updated, { shouldValidate: true });
  }

  function handleDietaryToggle(tag: DietaryTag, checked: boolean) {
    const current = dietaryTags;
    if (checked) {
      setValue("dietaryTags", [...current, tag], { shouldValidate: true });
    } else {
      setValue(
        "dietaryTags",
        current.filter((t) => t !== tag),
        { shouldValidate: true }
      );
    }
  }

  function handleAllergenToggle(allergen: Allergen, checked: boolean) {
    const current = allergens;
    if (checked) {
      setValue("allergens", [...current, allergen], { shouldValidate: true });
    } else {
      setValue(
        "allergens",
        current.filter((a) => a !== allergen),
        { shouldValidate: true }
      );
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={cn("flex flex-col gap-5", className)}
      noValidate
    >
      {/* Hidden sourceType */}
      <input type="hidden" {...register("sourceType")} />

      {/* Dish Name */}
      <FormField
        label="Nazwa dania"
        htmlFor="dishName"
        error={errors.dishName?.message}
        isMissing={isMissing("dishName")}
        required
      >
        <Input
          id="dishName"
          placeholder="np. Zupa pomidorowa z makaronem"
          maxLength={100}
          aria-invalid={!!errors.dishName}
          aria-describedby={errors.dishName ? "dishName-error" : undefined}
          {...register("dishName")}
        />
      </FormField>

      {/* Price */}
      <FormField
        label="Cena (PLN)"
        htmlFor="price"
        error={errors.price?.message}
        isMissing={isMissing("price")}
        required
      >
        <Input
          id="price"
          type="number"
          step="0.01"
          min="0.01"
          max="9999.99"
          placeholder="np. 25.00"
          aria-invalid={!!errors.price}
          aria-describedby={errors.price ? "price-error" : undefined}
          {...register("price", { valueAsNumber: true })}
        />
      </FormField>

      {/* Restaurant Selection */}
      <div className="flex flex-col gap-3">
        <Label>
          Wybierz istniejącą restaurację
          <span className="text-muted-foreground font-normal ml-1 text-xs">
            (opcjonalne)
          </span>
        </Label>
        <RestaurantSelect
          onSelect={handleRestaurantSelect}
          selectedId={selectedRestaurantId}
        />
        <p className="text-xs text-muted-foreground text-center">
          lub wpisz ręcznie poniżej
        </p>
      </div>

      {/* Restaurant Name */}
      <FormField
        label="Nazwa restauracji"
        htmlFor="restaurantName"
        error={errors.restaurantName?.message}
        isMissing={isMissing("restaurantName")}
        required
      >
        <Input
          id="restaurantName"
          placeholder="np. Restauracja Pod Lipami"
          maxLength={100}
          aria-invalid={!!errors.restaurantName}
          aria-describedby={
            errors.restaurantName ? "restaurantName-error" : undefined
          }
          {...register("restaurantName")}
        />
      </FormField>

      {/* Available Date */}
      <FormField
        label="Data dostępności"
        htmlFor="availableDate"
        error={errors.availableDate?.message}
        required
      >
        <Input
          id="availableDate"
          type="date"
          min={getTodayISO()}
          aria-invalid={!!errors.availableDate}
          aria-describedby={
            errors.availableDate ? "availableDate-error" : undefined
          }
          {...register("availableDate")}
        />
      </FormField>

      {/* Description */}
      <FormField
        label="Opis"
        htmlFor="description"
        error={errors.description?.message}
        isOptional
      >
        <Textarea
          id="description"
          placeholder="Krótki opis dania (opcjonalnie)"
          maxLength={500}
          rows={3}
          aria-invalid={!!errors.description}
          aria-describedby={
            errors.description ? "description-error" : undefined
          }
          {...register("description")}
        />
      </FormField>

      {/* Items (set components) */}
      <FormField
        label="Skład zestawu (opcjonalne)"
        error={errors.items?.message}
        isOptional
      >
        <div className="flex flex-col gap-2">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={item}
                onChange={(e) => handleItemChange(index, e.target.value)}
                placeholder={`Pozycja ${index + 1}`}
                maxLength={200}
                aria-label={`Pozycja zestawu ${index + 1}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveItem(index)}
                aria-label={`Usuń pozycję ${index + 1}`}
                className="shrink-0"
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
          {items.length < 10 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddItem}
              className="self-start"
            >
              <Plus className="size-4 mr-1" />
              Dodaj pozycję
            </Button>
          )}
        </div>
      </FormField>

      {/* Cuisine Type */}
      <FormField
        label="Typ kuchni"
        htmlFor="cuisineType"
        error={errors.cuisineType?.message}
        isOptional
      >
        <Select
          value={cuisineType ?? ""}
          onValueChange={(value) =>
            setValue("cuisineType", value as CuisineType, {
              shouldValidate: true,
            })
          }
        >
          <SelectTrigger id="cuisineType" className="w-full">
            <SelectValue placeholder="Wybierz typ kuchni" />
          </SelectTrigger>
          <SelectContent>
            {CUISINE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {/* Dietary Tags */}
      <FormField
        label="Tagi dietetyczne"
        error={errors.dietaryTags?.message}
        isOptional
      >
        <div className="flex flex-wrap gap-3">
          {DIETARY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <Checkbox
                checked={dietaryTags.includes(option.value)}
                onCheckedChange={(checked) =>
                  handleDietaryToggle(option.value, checked === true)
                }
              />
              {option.label}
            </label>
          ))}
        </div>
      </FormField>

      {/* Allergens */}
      <FormField
        label="Alergeny"
        error={errors.allergens?.message}
        isOptional
      >
        <div className="flex flex-wrap gap-3">
          {ALLERGEN_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <Checkbox
                checked={allergens.includes(option.value)}
                onCheckedChange={(checked) =>
                  handleAllergenToggle(option.value, checked === true)
                }
              />
              {option.label}
            </label>
          ))}
        </div>
      </FormField>

      {/* Restaurant Address */}
      <FormField
        label="Adres restauracji"
        htmlFor="restaurantAddress"
        error={errors.restaurantAddress?.message}
        isOptional
      >
        <Input
          id="restaurantAddress"
          placeholder="np. ul. Marszałkowska 10, Warszawa"
          maxLength={200}
          aria-invalid={!!errors.restaurantAddress}
          aria-describedby={
            errors.restaurantAddress ? "restaurantAddress-error" : undefined
          }
          {...register("restaurantAddress")}
        />
      </FormField>

      {/* Submit */}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="self-start mt-2"
      >
        {isSubmitting ? "Publikowanie..." : "Opublikuj ofertę"}
      </Button>
    </form>
  );
}

// ============================================================================
// FormField wrapper
// ============================================================================

function FormField({
  label,
  htmlFor,
  error,
  isMissing = false,
  isOptional = false,
  required = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  isMissing?: boolean;
  isOptional?: boolean;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
        {isOptional && (
          <span className="text-muted-foreground font-normal ml-1 text-xs">
            (opcjonalne)
          </span>
        )}
        {isMissing && (
          <span className="inline-flex items-center gap-1 ml-2 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-3" aria-hidden="true" />
            wymaga uzupełnienia
          </span>
        )}
      </Label>
      <div
        className={cn(
          isMissing &&
            "rounded-md ring-2 ring-amber-400/60 ring-offset-1 ring-offset-background"
        )}
      >
        {children}
      </div>
      {error && (
        <p
          id={htmlFor ? `${htmlFor}-error` : undefined}
          className="text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
