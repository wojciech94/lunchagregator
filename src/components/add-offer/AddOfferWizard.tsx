"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";
import { InputSelector, type InputSubmission } from "@/components/add-offer/InputSelector";
import { OfferPreview } from "@/components/add-offer/OfferPreview";
import { OfferForm } from "@/components/add-offer/OfferForm";
import { WeeklyMenuPreview } from "@/components/add-offer/WeeklyMenuPreview";
import { RestaurantAssignment } from "@/components/add-offer/RestaurantAssignment";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { analyzeUrlAction, analyzeTextAction, analyzeImageAction } from "@/actions/analyze";
import { createOfferAction, createOffersBatchAction } from "@/actions/offers";
import { validateExtraction, isWeeklyMenu, type PrefilledOffer, type PrefilledDish } from "@/lib/validations/extraction";
import type { AssignedRestaurant } from "@/lib/restaurant-match";
import type { ExtractedOffers } from "@/services/ai-analyzer";
import type { CreateOfferInput } from "@/lib/validations/offer";
import type { InputType } from "@/components/add-offer/InputSelector";
import { MenuEditor, contentFromExtraction } from "@/components/menus/MenuEditor";
import type { MenuContent } from "@/lib/recurring-menu";

// ============================================================================
// Types
// ============================================================================

/**
 * Requirement 6.5: an offer saved without coordinates is absent from
 * `get_offers_within_radius`, which filters `restaurant_location IS NOT NULL`.
 * The User is told this rather than left to wonder why distance sorting does
 * not show their offer.
 */
const LOCATION_WARNING =
  "Nie udało się ustalić lokalizacji z podanego adresu. Oferta została opublikowana, ale nie pojawi się w sortowaniu i wyszukiwaniu według odległości. Możesz ją edytować i poprawić adres.";

/** The batch form, where one shared address decides the outcome for every day. */
function locationWarningFor(count: number): string {
  return `${LOCATION_WARNING} Dotyczy to ${count} ${count === 1 ? "oferty" : "ofert"} z tego menu.`;
}

type Step = "input" | "analyzing" | "assignment" | "preview" | "weekly" | "form" | "saving" | "success" | "recurring";

interface PageState {
  step: Step;
  sourceType: InputType;
  prefilledData: PrefilledOffer | null;
  /**
   * Req 8.1: the restaurant assigned in the assignment step. Set before any
   * offer form opens and carried through publication; every payload the page
   * sends includes its id, name and address.
   */
  assigned: AssignedRestaurant | null;
  confidence: number;
  error: string | null;
  fieldErrors: Record<string, string>;
  successMessage: string | null;
  /**
   * Requirement 6.5. Set when the offer was saved but its address could not be
   * geocoded, so the offer will not appear in distance sorting. Shown on the
   * success screen, where the User can still act on it before leaving.
   */
  locationWarning: string | null;
}

// ============================================================================
// Page Component
// ============================================================================

export default function AddOfferWizard({ initialRestaurant = null, restaurantError = null }: {
  initialRestaurant?: AssignedRestaurant | null;
  restaurantError?: string | null;
}) {
  const router = useRouter();

  const [state, setState] = React.useState<PageState>({
    step: "input",
    sourceType: "link",
    prefilledData: null,
    assigned: initialRestaurant,
    confidence: 0,
    error: null,
    fieldErrors: {},
    successMessage: null,
    locationWarning: null,
  });

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [menuDraft, setMenuDraft] = React.useState<MenuContent | null>(null);
  const recurrenceReturnStep = React.useRef<Step>("preview");
  function openRecurring() {
    recurrenceReturnStep.current = state.step;
    setMenuDraft(contentFromExtraction(state.prefilledData?.dishes ?? [], state.sourceType));
    setState((previous) => ({ ...previous, step: "recurring", error: null }));
  }

  // Redirect to main page after success -- unless there is something to read.
  //
  // Requirement 6.5 asks the System to tell the User that distance sorting will
  // not include the offer. A 2-second redirect out from under that message
  // would make it unreadable in practice, so the warning holds the page open and
  // the User leaves by choice.
  React.useEffect(() => {
    if (state.step === "success" && !state.locationWarning) {
      const timer = setTimeout(() => {
        router.push("/");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [state.step, state.locationWarning, router]);

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

      // Req 8.1: the restaurant is assigned before any offer form opens,
      // whether the extraction produced a single offer or a weekly batch.
      setState((prev) => ({
        ...prev,
        step: prev.assigned ? (isWeeklyMenu(firstOffer) ? "weekly" : "preview") : "assignment",
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

  /**
   * Req 8.1: the assignment step's completion. Where the flow continues
   * depends on what the extraction produced: an empty manual form goes
   * straight to the form, a weekly batch to the day selector, everything else
   * to the single-offer preview.
   */
  function handleAssigned(restaurant: AssignedRestaurant) {
    setState((prev) => {
      const prefilled = prev.prefilledData;
      const nextStep: Step =
        !prefilled
          ? "input"
          : prefilled.dishes.length === 0 ? "form"
          : isWeeklyMenu(prefilled)
            ? "weekly"
            : "preview";

      return {
        ...prev,
        assigned: restaurant,
        step: nextStep,
        error: null,
        fieldErrors: {},
      };
    });
  }

  function handleSkipToManualForm() {
    // Create empty prefilled data for manual entry. Req 8.1 applies here too:
    // the assignment step runs first, in its choose phase (no extracted name).
    const emptyPrefilled: PrefilledOffer = {
      restaurantName: null,
      address: "",
      dishes: [],
      missingFields: ["restaurantName", "dishName", "price"],
    };

    setState((prev) => ({
      ...prev,
      step: prev.assigned ? "form" : "assignment",
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
      // Create the offer. Geocoding happens on the server, before the INSERT
      // -- see createOffer in services/offers.ts. It used to happen here,
      // afterwards, and the coordinates were discarded, which left every
      // AI-added offer permanently invisible to distance queries.
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

      setState((prev) => ({
        ...prev,
        step: "success",
        error: null,
        fieldErrors: {},
        locationWarning: createResult.locationWarning
          ? LOCATION_WARNING
          : null,
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
      assigned: state.assigned,
      confidence: 0,
      error: null,
      fieldErrors: {},
      successMessage: null,
      locationWarning: null,
    });
  }

  async function handleWeeklyConfirm(
    selected: { dish: PrefilledDish; date: string }[]
  ) {
    if (!state.prefilledData) return;
    const assigned = state.assigned;

    if (!assigned) {
      // Req 8.1 makes this unreachable through the UI; the guard keeps a
      // regression from publishing an unlinked batch.
      setState((prev) => ({
        ...prev,
        error: "Najpierw przypisz restaurację do tego menu.",
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

    const restaurantAddress = assigned.address || undefined;

    // Build a CreateOfferInput payload per selected dish/day. Name, address
    // and restaurantId come from the assigned restaurant; the server takes
    // the snapshot from the entity row (Req 8.3).
    const payloads = selected.map(({ dish, date }) => ({
      dishName: dish.name as string,
      price: dish.price as number,
      restaurantName: assigned.name,
      availableDate: date,
      sourceType: state.sourceType,
      description: dish.description || undefined,
      items: dish.items,
      dietaryTags: dish.dietaryTags,
      allergens: dish.allergens,
      restaurantAddress,
      restaurantId: assigned.id,
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

      const { created, failed, missingCoordinates } = result.data;
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
        locationWarning:
          missingCoordinates > 0 ? locationWarningFor(missingCoordinates) : null,
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
      {restaurantError && <p className="mb-4 text-sm text-warning-foreground" role="status">{restaurantError}</p>}
      {state.assigned && state.step !== "success" && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
          <div className="text-sm"><p className="font-semibold">{state.assigned.name}</p><p className="text-muted-foreground">{state.assigned.address}</p></div>
          <Button type="button" variant="outline" size="sm" disabled={isSubmitting || state.step === "analyzing"} onClick={() => setState((prev) => ({ ...prev, assigned: null, step: "assignment", error: null, fieldErrors: {} }))}>Zmień restaurację</Button>
        </div>
      )}
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

      {/* Keep the selector mounted so failures and manual fallback retain input. */}
      <div className="space-y-4" hidden={state.step !== "input" && state.step !== "analyzing"}>
        <InputSelector
          onSubmit={handleInputSubmit}
          isLoading={state.step === "analyzing"}
        />
        {state.step === "input" && !state.error && <Button type="button" variant="outline" onClick={handleSkipToManualForm}>Wprowadź dane ręcznie</Button>}
      </div>

      {/* Step: Restaurant assignment (Req 8.1) */}
      {state.step === "assignment" && (
        <div className="flex flex-col gap-4">
          <RestaurantAssignment
            extractedName={state.prefilledData?.restaurantName ?? null}
            onAssigned={handleAssigned}
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

      {/* Step: Preview */}
      {state.step === "preview" && state.prefilledData && state.assigned && (
        <div className="flex flex-col gap-4">
          <OfferPreview
            offer={state.prefilledData}
            sourceType={state.sourceType}
            confidence={state.confidence}
            onEdit={handleEditFromPreview}
          />
          <Button variant="outline" onClick={openRecurring}>Powtarzaj automatycznie</Button>
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
      {state.step === "weekly" && state.prefilledData && state.assigned && (
        <div className="flex flex-col gap-4">
          <WeeklyMenuPreview
            offer={state.prefilledData}
            assignedRestaurant={state.assigned}
            onConfirm={handleWeeklyConfirm}
            isSubmitting={isSubmitting}
          />
          <Button variant="outline" disabled={isSubmitting} onClick={openRecurring}>Powtarzaj automatycznie</Button>
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
      {state.step === "form" && state.prefilledData && state.assigned && (
        <div className="flex flex-col gap-4">
          <OfferForm
            prefilledData={state.prefilledData}
            sourceType={state.sourceType}
            assignedRestaurant={state.assigned}
            onSubmit={handleFormSubmit}
            onRecurring={(data) => {
              recurrenceReturnStep.current = "form";
              setMenuDraft({
                kind: "fixed",
                entries: [
                  {
                    id: crypto.randomUUID(),
                    dishName: data.dishName,
                    price: data.price,
                    description: data.description ?? null,
                    items: data.items,
                    dietaryTags: data.dietaryTags,
                    allergens: data.allergens,
                    cuisineType: data.cuisineType ?? null,
                    sourceType: data.sourceType,
                    days: [1, 2, 3, 4, 5],
                  },
                ],
              });
              setState((previous) => ({ ...previous, step: "recurring", error: null }));
            }}
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

      {/* Step: Recurring menu publication (#139) */}
      {state.step === "recurring" && state.assigned && menuDraft && (
        <MenuEditor
          restaurant={state.assigned}
          initialContent={menuDraft}
          onCancel={() =>
            setState((previous) => ({ ...previous, step: recurrenceReturnStep.current }))
          }
          onSaved={() => router.push("/my-menus")}
        />
      )}

      {/* Step: Success */}
      {state.step === "success" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <CheckCircle2 className="size-12 text-success" aria-hidden="true" />
            <div className="text-center">
              <p className="text-lg font-medium text-foreground">
                {state.successMessage ?? "Oferta została opublikowana!"}
              </p>
              {state.locationWarning ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {/* The 2s auto-redirect is suspended while this is set, so the
                      User is not taken away mid-sentence. */}
                  Możesz przejść do ofert ręcznie poniżej.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">
                  Za chwilę zostaniesz przekierowany na stronę główną...
                </p>
              )}
            </div>
            {state.locationWarning && (
              <div
                className="flex items-start gap-3 rounded-lg border border-warning-border bg-warning p-4 text-left"
                role="status"
              >
                <AlertTriangle
                  className="mt-0.5 size-5 shrink-0 text-warning-foreground"
                  aria-hidden="true"
                />
                <p className="text-sm text-foreground">{state.locationWarning}</p>
              </div>
            )}
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
