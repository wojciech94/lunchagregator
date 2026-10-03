"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";
import { InputSelector, type InputSubmission } from "@/components/add-offer/InputSelector";
import { OfferPreview } from "@/components/add-offer/OfferPreview";
import { OfferForm } from "@/components/add-offer/OfferForm";
import { WeeklyMenuPreview } from "@/components/add-offer/WeeklyMenuPreview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { analyzeUrlAction, analyzeTextAction, analyzeImageAction } from "@/actions/analyze";
import { createOfferAction, createOffersBatchAction } from "@/actions/offers";
import { geocodeAddressAction } from "@/actions/geocode";
import { validateExtraction, isWeeklyMenu, type PrefilledOffer, type PrefilledDish } from "@/lib/validations/extraction";
import { todayISO } from "@/utils/day-of-week";
import type { ExtractedOffers } from "@/services/ai-analyzer";
import type { CreateOfferInput } from "@/lib/validations/offer";
import type { InputType } from "@/components/add-offer/InputSelector";

// ============================================================================
// Types
// ============================================================================

type Step = "input" | "analyzing" | "preview" | "weekly" | "form" | "saving" | "success";

interface PageState {
  step: Step;
  sourceType: InputType;
  prefilledData: PrefilledOffer | null;
  confidence: number;
  error: string | null;
  fieldErrors: Record<string, string>;
  successMessage: string | null;
}

// ============================================================================
// Page Component
// ============================================================================

export default function AddOfferPage() {
  const router = useRouter();

  const [state, setState] = React.useState<PageState>({
    step: "input",
    sourceType: "link",
    prefilledData: null,
    confidence: 0,
    error: null,
    fieldErrors: {},
    successMessage: null,
  });

  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Redirect to main page after success
  React.useEffect(() => {
    if (state.step === "success") {
      const timer = setTimeout(() => {
        router.push("/");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [state.step, router]);

  // ============================================================================
  // Handlers
  // ============================================================================

  async function handleInputSubmit(submission: InputSubmission) {
    setState((prev) => ({
      ...prev,
      step: "analyzing",
      sourceType: submission.type,
      error: null,
    }));

    try {
      type AnalyzeResult =
        | { success: true; data: ExtractedOffers }
        | { success: false; error: string };

      let result: AnalyzeResult;

      switch (submission.type) {
        case "link":
          result = await analyzeUrlAction(submission.value);
          break;
        case "text":
          result = await analyzeTextAction(submission.value);
          break;
        case "photo":
          result = await analyzeImageAction(submission.value);
          break;
      }

      if (!result.success) {
        // AI extraction failed → show error and offer manual form
        setState((prev) => ({
          ...prev,
          step: "input",
          error: result.error,
        }));
        return;
      }

      // Validate extraction results
      const validation = validateExtraction(result.data);

      if (validation.prefilledData.length === 0) {
        // No offers extracted at all. A rate limit arrives as an empty
        // extraction too, and it carries its own message so the User is not
        // told the model found nothing.
        setState((prev) => ({
          ...prev,
          step: "input",
          error:
            result.data.message ??
            "Nie udało się wyekstrahować żadnych ofert. Spróbuj ponownie lub wprowadź dane ręcznie.",
        }));
        return;
      }

      // Use the first offer for preview/form
      const firstOffer = validation.prefilledData[0];

      // If the offer is a weekly menu (dishes spread across ≥2 days), go to the
      // weekly batch preview instead of the single-offer preview.
      if (isWeeklyMenu(firstOffer)) {
        setState((prev) => ({
          ...prev,
          step: "weekly",
          prefilledData: firstOffer,
          confidence: validation.confidence,
          error: null,
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        step: "preview",
        prefilledData: firstOffer,
        confidence: validation.confidence,
        error: null,
      }));
    } catch {
      // Unexpected error → show error and offer manual form
      setState((prev) => ({
        ...prev,
        step: "input",
        error: "Wystąpił nieoczekiwany błąd podczas analizy. Spróbuj ponownie lub wprowadź dane ręcznie.",
      }));
    }
  }

  function handleEditFromPreview() {
    setState((prev) => ({
      ...prev,
      step: "form",
      error: null,
      fieldErrors: {},
    }));
  }

  function handleSkipToManualForm() {
    // Create empty prefilled data for manual entry
    const emptyPrefilled: PrefilledOffer = {
      restaurantName: null,
      address: "",
      dishes: [],
      missingFields: ["restaurantName", "dishName", "price"],
    };

    setState((prev) => ({
      ...prev,
      step: "form",
      prefilledData: emptyPrefilled,
      confidence: 0,
      error: null,
      fieldErrors: {},
    }));
  }

  async function handleFormSubmit(data: CreateOfferInput) {
    setIsSubmitting(true);
    setState((prev) => ({ ...prev, error: null, fieldErrors: {} }));

    try {
      // Step 1: Create the offer
      const createResult = await createOfferAction(data);

      if (!createResult.success) {
        setState((prev) => ({
          ...prev,
          error: createResult.error,
          fieldErrors: createResult.fieldErrors ?? {},
        }));
        setIsSubmitting(false);
        return;
      }

      // Step 2: Geocode address if provided (per requirement 6.4)
      if (data.restaurantAddress && data.restaurantAddress.trim().length > 0) {
        const geocodeResult = await geocodeAddressAction(data.restaurantAddress);
        // Per requirement 6.5: if geocoding fails, we still save without coordinates
        // The geocodeAddressAction already handles this gracefully
        if (!geocodeResult.success) {
          // Non-critical: just log, offer is already saved
          console.warn("Geocoding failed:", geocodeResult.error);
        }
      }

      // Step 3: Success!
      setState((prev) => ({
        ...prev,
        step: "success",
        error: null,
        fieldErrors: {},
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        error: "Wystąpił nieoczekiwany błąd podczas zapisywania oferty. Spróbuj ponownie.",
      }));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleBackToInput() {
    setState({
      step: "input",
      sourceType: "link",
      prefilledData: null,
      confidence: 0,
      error: null,
      fieldErrors: {},
      successMessage: null,
    });
  }

  async function handleWeeklyConfirm(
    selected: { dish: PrefilledDish; date: string }[],
    restaurantName: string
  ) {
    if (!state.prefilledData) return;

    const name = restaurantName.trim();
    if (name.length === 0) {
      setState((prev) => ({
        ...prev,
        error: "Nazwa restauracji jest wymagana do opublikowania menu.",
      }));
      return;
    }

    if (selected.length === 0) {
      setState((prev) => ({
        ...prev,
        error: "Nie wybrano żadnej oferty do opublikowania.",
      }));
      return;
    }

    setIsSubmitting(true);
    setState((prev) => ({ ...prev, error: null, fieldErrors: {} }));

    const restaurantAddress = state.prefilledData.address || undefined;

    // Build a CreateOfferInput payload per selected dish/day
    const payloads = selected.map(({ dish, date }) => ({
      dishName: dish.name as string,
      price: dish.price as number,
      restaurantName: name,
      availableDate: date,
      sourceType: state.sourceType,
      description: dish.description || undefined,
      items: dish.items,
      dietaryTags: dish.dietaryTags,
      allergens: dish.allergens,
      restaurantAddress,
    }));

    try {
      const result = await createOffersBatchAction(payloads);

      if (!result.success) {
        setState((prev) => ({
          ...prev,
          error: result.error,
          fieldErrors: result.fieldErrors ?? {},
        }));
        setIsSubmitting(false);
        return;
      }

      const { created, failed } = result.data;
      const message =
        failed.length > 0
          ? `Opublikowano ${created.length} ofert. ${failed.length} nie udało się zapisać.`
          : `Opublikowano ${created.length} ${created.length === 1 ? "ofertę" : "ofert"} na cały tydzień!`;

      setState((prev) => ({
        ...prev,
        step: "success",
        error: null,
        fieldErrors: {},
        successMessage: message,
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        error: "Wystąpił nieoczekiwany błąd podczas zapisywania ofert. Spróbuj ponownie.",
      }));
    } finally {
      setIsSubmitting(false);
    }
  }

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/")}
          className="mb-4"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Powrót do ofert
        </Button>
        <h1 className="text-2xl font-bold text-foreground">Dodaj ofertę lunchową</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Wklej link, tekst lub zdjęcie — AI wyekstrahuje dane oferty
        </p>
      </div>

      {/* Error message */}
      {state.error && state.step !== "success" && (
        <div
          className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4"
          role="alert"
        >
          <AlertTriangle className="size-5 shrink-0 text-destructive mt-0.5" aria-hidden="true" />
          <div className="flex flex-col gap-2">
            <p className="text-sm text-destructive">{state.error}</p>
            {state.step === "input" && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSkipToManualForm}
                className="self-start"
              >
                Wprowadź dane ręcznie
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Field-level errors from createOffer */}
      {Object.keys(state.fieldErrors).length > 0 && (
        <div
          className="mb-4 rounded-lg border border-destructive/50 bg-destructive/5 p-4"
          role="alert"
        >
          <p className="text-sm font-medium text-destructive mb-2">
            Popraw następujące pola:
          </p>
          <ul className="list-disc list-inside text-sm text-destructive space-y-1">
            {Object.entries(state.fieldErrors).map(([field, message]) => (
              <li key={field}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Step: Input */}
      {state.step === "input" && (
        <InputSelector
          onSubmit={handleInputSubmit}
          isLoading={false}
        />
      )}

      {/* Step: Analyzing (loading) */}
      {state.step === "analyzing" && (
        <InputSelector
          onSubmit={handleInputSubmit}
          isLoading={true}
        />
      )}

      {/* Step: Preview */}
      {state.step === "preview" && state.prefilledData && (
        <div className="flex flex-col gap-4">
          <OfferPreview
            offer={state.prefilledData}
            sourceType={state.sourceType}
            confidence={state.confidence}
            onEdit={handleEditFromPreview}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToInput}
            className="self-start"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Wróć do wprowadzania danych
          </Button>
        </div>
      )}

      {/* Step: Weekly menu batch preview */}
      {state.step === "weekly" && state.prefilledData && (
        <div className="flex flex-col gap-4">
          <WeeklyMenuPreview
            offer={state.prefilledData}
            onConfirm={handleWeeklyConfirm}
            isSubmitting={isSubmitting}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToInput}
            className="self-start"
            disabled={isSubmitting}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Wróć do wprowadzania danych
          </Button>
        </div>
      )}

      {/* Step: Form */}
      {state.step === "form" && state.prefilledData && (
        <div className="flex flex-col gap-4">
          <OfferForm
            prefilledData={state.prefilledData}
            sourceType={state.sourceType}
            onSubmit={handleFormSubmit}
            isSubmitting={isSubmitting}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToInput}
            className="self-start"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Wróć do wprowadzania danych
          </Button>
        </div>
      )}

      {/* Step: Success */}
      {state.step === "success" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <CheckCircle2 className="size-12 text-green-500" aria-hidden="true" />
            <div className="text-center">
              <p className="text-lg font-medium text-foreground">
                {state.successMessage ?? "Oferta została opublikowana!"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Za chwilę zostaniesz przekierowany na stronę główną...
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => router.push("/")}
            >
              Przejdź do ofert
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
