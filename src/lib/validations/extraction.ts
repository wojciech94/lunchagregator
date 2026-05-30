import type {
  ExtractedOffers,
  ExtractedOffer,
  ExtractedDish,
  DayOfWeek,
} from '@/services/ai-analyzer';
import type { DietaryTag, Allergen } from '@/types/offers';

// ============================================================================
// Types
// ============================================================================

/**
 * A single dish in a form-friendly format with missing field indicators.
 */
export interface PrefilledDish {
  name: string | null;
  price: number | null;
  description: string;
  items: string[];
  dietaryTags: DietaryTag[];
  allergens: Allergen[];
  dayOfWeek: DayOfWeek | null;
  missingFields: string[];
}

/**
 * A single offer in a form-friendly format with missing field indicators.
 */
export interface PrefilledOffer {
  restaurantName: string | null;
  address: string;
  dishes: PrefilledDish[];
  missingFields: string[];
}

/**
 * Result of validating extracted offers.
 * Separates valid (ready to publish) from partial (need user input) offers.
 */
export interface ExtractionValidationResult {
  validOffers: PrefilledOffer[];
  partialOffers: PrefilledOffer[];
  missingFields: string[];
  prefilledData: PrefilledOffer[];
  confidence: number;
  sourceType: 'link' | 'text' | 'photo';
}

// ============================================================================
// Validation Logic
// ============================================================================

/**
 * Checks if a string value is present and non-empty.
 */
function isNonEmptyString(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.trim().length > 0;
}

/**
 * Checks if a price value is valid (non-null and greater than 0).
 */
function isValidPrice(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && value > 0;
}

/**
 * Validates a single extracted dish and returns a form-friendly representation
 * with missing field indicators.
 */
function validateDish(
  dish: ExtractedDish,
  offerIndex: number,
  dishIndex: number,
  totalOffers: number,
  totalDishes: number
): PrefilledDish {
  const missingFields: string[] = [];

  const offerPrefix = totalOffers > 1 ? `offers[${offerIndex}].` : '';
  const dishPrefix =
    totalDishes > 1
      ? `${offerPrefix}dishes[${dishIndex}].`
      : `${offerPrefix}`;

  if (!isNonEmptyString(dish.name)) {
    missingFields.push(`${dishPrefix}dishName`);
  }

  if (!isValidPrice(dish.price)) {
    missingFields.push(`${dishPrefix}price`);
  }

  return {
    name: dish.name,
    price: dish.price,
    description: dish.description ?? '',
    items: (dish.items ?? []) as string[],
    dietaryTags: (dish.dietaryTags ?? []) as DietaryTag[],
    allergens: (dish.allergens ?? []) as Allergen[],
    dayOfWeek: dish.dayOfWeek ?? null,
    missingFields,
  };
}

/**
 * Validates a single extracted offer and returns a form-friendly representation
 * with missing field indicators.
 */
function validateOffer(
  offer: ExtractedOffer,
  offerIndex: number,
  totalOffers: number
): PrefilledOffer {
  const missingFields: string[] = [];
  const offerPrefix = totalOffers > 1 ? `offers[${offerIndex}].` : '';

  if (!isNonEmptyString(offer.restaurantName)) {
    missingFields.push(`${offerPrefix}restaurantName`);
  }

  if (offer.dishes.length === 0) {
    missingFields.push(`${offerPrefix}dishName`, `${offerPrefix}price`);
  }

  const validatedDishes = offer.dishes.map((dish, dishIndex) =>
    validateDish(dish, offerIndex, dishIndex, totalOffers, offer.dishes.length)
  );

  // Collect dish-level missing fields into the offer's missing fields
  const allDishMissingFields = validatedDishes.flatMap((d) => d.missingFields);

  return {
    restaurantName: offer.restaurantName,
    address: offer.address ?? '',
    dishes: validatedDishes,
    missingFields: [...missingFields, ...allDishMissingFields],
  };
}

/**
 * Determines if a prefilled offer is fully valid (all required fields present).
 */
function isOfferValid(offer: PrefilledOffer): boolean {
  return offer.missingFields.length === 0 && offer.dishes.length > 0;
}

/**
 * Detects whether an offer represents a weekly menu — i.e. it has dishes
 * assigned to two or more distinct days of the week.
 */
export function isWeeklyMenu(offer: PrefilledOffer): boolean {
  const days = new Set(
    offer.dishes
      .map((d) => d.dayOfWeek)
      .filter((d): d is NonNullable<typeof d> => d !== null)
  );
  return days.size >= 2;
}

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Validates AI extraction output and categorizes offers into valid and partial.
 *
 * Takes raw AI extraction output and validates it against required fields:
 * - restaurantName: must be non-null and non-empty
 * - Each dish must have a name (non-null, non-empty) and price (non-null, > 0)
 *
 * Returns a structured result with:
 * - validOffers: offers that have all required fields (ready to publish)
 * - partialOffers: offers with some fields missing (need user input)
 * - missingFields: aggregated list of all missing field names
 * - prefilledData: all offers with successfully extracted fields pre-filled
 * - confidence: extraction confidence score
 * - sourceType: the source type of the extraction
 */
export function validateExtraction(
  extraction: ExtractedOffers
): ExtractionValidationResult {
  const { offers, sourceType, confidence } = extraction;

  if (offers.length === 0) {
    return {
      validOffers: [],
      partialOffers: [],
      missingFields: ['restaurantName', 'dishName', 'price'],
      prefilledData: [],
      confidence,
      sourceType,
    };
  }

  const validatedOffers = offers.map((offer, index) =>
    validateOffer(offer, index, offers.length)
  );

  const validOffers = validatedOffers.filter(isOfferValid);
  const partialOffers = validatedOffers.filter((o) => !isOfferValid(o));

  // Aggregate all missing fields across all offers
  const allMissingFields = validatedOffers.flatMap((o) => o.missingFields);

  return {
    validOffers,
    partialOffers,
    missingFields: allMissingFields,
    prefilledData: validatedOffers,
    confidence,
    sourceType,
  };
}
