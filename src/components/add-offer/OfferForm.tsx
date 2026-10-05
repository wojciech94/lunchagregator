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
import type { DayOfWeek } from "@/services/ai-analyzer";
import {
  createOfferSchema,
  type CreateOfferInput,
} from "@/lib/validations/offer";
import type { PrefilledOffer } from "@/lib/validations/extraction";
import type { CuisineType, DietaryTag, Allergen } from "@/types/offers";
import { nextDateForDay, todayISO } from "@/utils/day-of-week";
import type { AssignedRestaurant } from "@/lib/restaurant-match";

// ============================================================================
// Types
// ============================================================================

export interface OfferFormProps {
  prefilledData: PrefilledOffer;
  sourceType: "link" | "text" | "photo";
  /**
   * Req 8.1: the restaurant assigned in the previous step. The form renders
   * it instead of free-text restaurant fields; its values are the defaults
   * for the snapshot fields (the server re-asserts them from the entity).
   */
  assignedRestaurant: AssignedRestaurant;
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

/**
 * Canonical extraction weekdays, for a runtime check at the resolution
 * boundary. Malformed, unsupported or unassociated values must be treated as
 * absent rather than fed to nextDateForDay, which would produce an invalid
 * date (spec: extracted-offer-date-fix, preservation property 3).
 */
const CANONICAL_DAYS: readonly string[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function canonicalDayOfWeek(value: unknown): DayOfWeek | null {
  return typeof value === "string" && CANONICAL_DAYS.includes(value)
    ? (value as DayOfWeek)
    : null;
}

function buildDefaultValues(
  prefilledData: PrefilledOffer,
  sourceType: "link" | "text" | "photo",
  assignedRestaurant: AssignedRestaurant
): Partial<CreateOfferInput> {
  const firstDish = prefilledData.dishes[0];
  const day = canonicalDayOfWeek(firstDish?.dayOfWeek);

  return {
    dishName: firstDish?.name ?? "",
    price: firstDish?.price ?? undefined,
    restaurantName: assignedRestaurant.name,
    availableDate: day ? nextDateForDay(day) : todayISO(),
    sourceType,
    description: firstDish?.description ?? "",
    items: firstDish?.items ?? [],
    cuisineType: undefined,
    dietaryTags: firstDish?.dietaryTags ?? [],
    allergens: firstDish?.allergens ?? [],
    restaurantAddress: assignedRestaurant.address ?? "",
    restaurantId: assignedRestaurant.id,
  };
}

// ============================================================================
// Component
// ============================================================================

export function OfferForm({
  prefilledData,
  sourceType,
  assignedRestaurant,
  onSubmit,
  isSubmitting = false,
  className,
}: OfferFormProps) {
  const missingFields = prefilledData.missingFields;
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateOfferInput>({
    resolver: zodResolver(createOfferSchema),
    defaultValues: buildDefaultValues(prefilledData, sourceType, assignedRestaurant),
  });

  const dietaryTags = watch("dietaryTags") ?? [];
  const allergens = watch("allergens") ?? [];
  const cuisineType = watch("cuisineType");
  const items = watch("items") ?? [];

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
      {/* Hidden fields the schema needs; their values are the assigned
          restaurant's, set in defaultValues. Req 8.3: the server re-asserts
          the snapshot from the entity, so these are prefills, not authority. */}
      <input type="hidden" {...register("sourceType")} />
      <input type="hidden" {...register("restaurantName")} />
      <input type="hidden" {...register("restaurantAddress")} />
      <input type="hidden" {...register("restaurantId")} />

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

      {/* Assigned restaurant (Req 8.1–8.3): bound in the previous step,
          rendered read-only. Its name and address become the offer's snapshot
          at publish; edits to the restaurant happen on the restaurant, not
          here. */}
      <div className="rounded-md border border-border bg-muted/30 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Restauracja
        </p>
        <p className="mt-1 text-base font-semibold text-foreground">
          {assignedRestaurant.name}
        </p>
        {assignedRestaurant.address && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {assignedRestaurant.address}
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Nazwa i adres zostaną zapisane na ofercie w stanie obecnym. Zmiany
          adresu zrób w edycji restauracji.
        </p>
      </div>

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
          min={todayISO()}
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
