"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createRestaurantSchema } from "@/schemas/restaurant.schema";
import { geocodeAddressAction } from "@/actions/geocode";
import { createRestaurant, updateRestaurant } from "@/actions/restaurants";
import { LunchHoursInput } from "./LunchHoursInput";
import type { Restaurant, LunchHours, PriceLevel, CreateRestaurantInput, UpdateRestaurantInput } from "@/types/restaurants";
import type { CuisineType, Coordinates } from "@/types/offers";

// ============================================================================
// Types
// ============================================================================

export interface RestaurantFormProps {
  sessionToken: string;
  initialData?: Partial<Restaurant>;
  /** When provided, the form operates in EDIT mode and calls updateRestaurant. */
  restaurantId?: string;
  className?: string;
  onSuccess?: (restaurant: Restaurant) => void;
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

const PRICE_LEVEL_OPTIONS: { value: PriceLevel; label: string }[] = [
  { value: "budżetowa", label: "Budżetowa" },
  { value: "średnia", label: "Średnia" },
  { value: "premium", label: "Premium" },
];

// ============================================================================
// Component
// ============================================================================

export function RestaurantForm({
  sessionToken,
  initialData,
  restaurantId,
  className,
  onSuccess,
}: RestaurantFormProps) {
  const isEditMode = !!restaurantId;
  const [name, setName] = React.useState(initialData?.name ?? "");
  const [description, setDescription] = React.useState(initialData?.description ?? "");
  const [address, setAddress] = React.useState(initialData?.address ?? "");
  const [priceLevel, setPriceLevel] = React.useState<PriceLevel | "">(initialData?.priceLevel ?? "");
  const [lunchHours, setLunchHours] = React.useState<LunchHours | null>(initialData?.lunchHours ?? null);
  const [cuisineTypes, setCuisineTypes] = React.useState<CuisineType[]>(initialData?.cuisineTypes ?? []);
  const [phoneNumber, setPhoneNumber] = React.useState(initialData?.phoneNumber ?? "");
  const [websiteUrl, setWebsiteUrl] = React.useState(initialData?.websiteUrl ?? "");
  const [location, setLocation] = React.useState<Coordinates | null>(initialData?.location ?? null);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isGeocoding, setIsGeocoding] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [geocodeMessage, setGeocodeMessage] = React.useState<string | null>(null);

  async function handleAddressBlur() {
    const trimmedAddress = address.trim();
    if (!trimmedAddress) { setLocation(null); setGeocodeMessage(null); return; }
    setIsGeocoding(true);
    setGeocodeMessage(null);
    const result = await geocodeAddressAction(trimmedAddress);
    if (result.success && result.data) { setLocation(result.data); }
    else if (result.success && !result.data) {
      setLocation(null);
      setGeocodeMessage("Nie udało się ustalić współrzędnych — funkcje odległościowe nie będą dostępne.");
    } else { setLocation(null); }
    setIsGeocoding(false);
  }

  function handleCuisineToggle(cuisine: CuisineType, checked: boolean) {
    if (checked) setCuisineTypes((prev) => [...prev, cuisine]);
    else setCuisineTypes((prev) => prev.filter((c) => c !== cuisine));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const inputData: CreateRestaurantInput = {
      name: name.trim(),
      sessionToken,
      ...(description.trim() && { description: description.trim() }),
      ...(address.trim() && { address: address.trim() }),
      ...(location && { location }),
      ...(priceLevel && { priceLevel }),
      ...(lunchHours && { lunchHours }),
      ...(cuisineTypes.length > 0 && { cuisineTypes }),
      ...(phoneNumber.trim() && { phoneNumber: phoneNumber.trim() }),
      ...(websiteUrl.trim() && { websiteUrl: websiteUrl.trim() }),
    };

    const validation = createRestaurantSchema.safeParse(inputData);
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

    if (isEditMode && restaurantId) {
      // EDIT mode — build UpdateRestaurantInput (nullable to clear optional fields)
      const updateData: UpdateRestaurantInput = {
        name: name.trim(),
        description: description.trim() || null,
        address: address.trim() || null,
        location: location ?? null,
        priceLevel: priceLevel || null,
        lunchHours: lunchHours ?? null,
        cuisineTypes,
        phoneNumber: phoneNumber.trim() || null,
        websiteUrl: websiteUrl.trim() || null,
      };

      const result = await updateRestaurant(restaurantId, updateData, sessionToken);
      if (result.success) {
        onSuccess?.(result.data);
      } else {
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        setFormError(result.error);
      }
      setIsSubmitting(false);
      return;
    }

    const result = await createRestaurant(inputData);
    if (result.success) { onSuccess?.(result.data); }
    else {
      if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      setFormError(result.error);
    }
    setIsSubmitting(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("flex flex-col gap-6", className)}
      noValidate
    >
      {/* Form error */}
      {formError && (
        <div className="rounded-[4px] border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive" role="alert">{formError}</p>
        </div>
      )}

      {/* Name */}
      <FormField label="Nazwa restauracji" htmlFor="restaurant-name" error={fieldErrors["name"]} required>
        <Input
          id="restaurant-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="np. Restauracja Pod Lipami"
          maxLength={100}
          className="bg-card border-border focus:border-primary"
          aria-invalid={!!fieldErrors["name"]}
        />
      </FormField>

      {/* Description */}
      <FormField label="Opis" htmlFor="restaurant-description" error={fieldErrors["description"]} isOptional>
        <Textarea
          id="restaurant-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Krótki opis restauracji"
          maxLength={500}
          rows={3}
          className="bg-card border-border focus:border-primary resize-none"
          aria-invalid={!!fieldErrors["description"]}
        />
      </FormField>

      {/* Address */}
      <FormField label="Adres" htmlFor="restaurant-address" error={fieldErrors["address"]} isOptional>
        <Input
          id="restaurant-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onBlur={handleAddressBlur}
          placeholder="np. ul. Marszałkowska 10, Warszawa"
          maxLength={200}
          className="bg-card border-border focus:border-primary"
          aria-invalid={!!fieldErrors["address"]}
        />
        {isGeocoding && <p className="text-xs text-muted-foreground mt-1 animate-pulse">Geokodowanie...</p>}
        {geocodeMessage && <p className="text-xs text-amber-400 mt-1">{geocodeMessage}</p>}
      </FormField>

      {/* Price Level */}
      <FormField label="Poziom cenowy" error={fieldErrors["priceLevel"]} isOptional>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Poziom cenowy">
          {PRICE_LEVEL_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPriceLevel(priceLevel === option.value ? "" : option.value)}
              className={cn(
                "rounded-[4px] border px-3 py-2 text-sm transition-colors",
                priceLevel === option.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </FormField>

      {/* Lunch Hours */}
      <FormField
        label="Godziny lunchowe"
        error={fieldErrors["lunchHours"] || fieldErrors["lunchHours.start"] || fieldErrors["lunchHours.end"]}
        isOptional
      >
        <LunchHoursInput
          value={lunchHours}
          onChange={setLunchHours}
          error={fieldErrors["lunchHours"] || fieldErrors["lunchHours.start"] || fieldErrors["lunchHours.end"]}
        />
      </FormField>

      {/* Cuisine Types */}
      <FormField label="Typ kuchni" error={fieldErrors["cuisineTypes"]} isOptional>
        <div className="flex flex-wrap gap-2">
          {CUISINE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleCuisineToggle(option.value, !cuisineTypes.includes(option.value))}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                cuisineTypes.includes(option.value)
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/20 hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </FormField>

      {/* Phone */}
      <FormField label="Numer telefonu" htmlFor="restaurant-phone" error={fieldErrors["phoneNumber"]} isOptional>
        <Input
          id="restaurant-phone"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="np. +48 123 456 789"
          maxLength={20}
          type="tel"
          className="bg-card border-border focus:border-primary"
          aria-invalid={!!fieldErrors["phoneNumber"]}
        />
      </FormField>

      {/* Website */}
      <FormField label="Strona internetowa" htmlFor="restaurant-url" error={fieldErrors["websiteUrl"]} isOptional>
        <Input
          id="restaurant-url"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          placeholder="np. https://restauracja.pl"
          maxLength={500}
          type="url"
          className="bg-card border-border focus:border-primary"
          aria-invalid={!!fieldErrors["websiteUrl"]}
        />
      </FormField>

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="self-start mt-2 inline-flex min-h-[48px] items-center rounded-[4px] bg-primary px-6 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-[#5e6ad2] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {isSubmitting
          ? "Zapisywanie..."
          : initialData
            ? "Zapisz zmiany"
            : "Dodaj restaurację"}
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
        {isOptional && <span className="font-normal normal-case tracking-normal ml-1.5 text-muted-foreground/60">(opcjonalne)</span>}
      </Label>
      {children}
      {error && (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
