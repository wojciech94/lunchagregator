import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { AI_MODEL_ID } from '@/lib/ai/models';
import { z } from 'zod';
import type { DietaryTag, Allergen } from '@/types/offers';

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

// ============================================================================
// Types
// ============================================================================

export interface ExtractedDish {
  name: string | null;
  price: number | null;
  description?: string;
  items?: string[];
  dietaryTags?: DietaryTag[];
  allergens?: Allergen[];
  dayOfWeek?: DayOfWeek | null;
}

export interface ExtractedOffer {
  restaurantName: string | null;
  dishes: ExtractedDish[];
  address?: string;
}

export interface ExtractedOffers {
  offers: ExtractedOffer[];
  sourceType: 'link' | 'text' | 'photo';
  confidence: number;
  missingFields: string[];
}

// ============================================================================
// Zod Schema for AI Extraction
// ============================================================================

const dietaryTagValues = [
  'vegetarian',
  'vegan',
  'gluten-free',
  'dairy-free',
  'keto',
] as const;

const allergenValues = [
  'gluten',
  'orzechy',
  'mleko',
  'jaja',
  'ryby',
  'skorupiaki',
  'soja',
  'seler',
  'gorczyca',
  'sezam',
] as const;

const dayOfWeekValues = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

const extractedDishSchema = z.object({
  name: z.string().nullable().describe('Name of the dish'),
  price: z.number().nullable().describe('Price of the dish in PLN'),
  description: z.string().optional().describe('Short description of the dish'),
  items: z
    .array(z.string())
    .optional()
    .describe('Components of a lunch set (zestaw), e.g. soup, main course, drink. Empty for single dishes.'),
  dietaryTags: z
    .array(z.enum(dietaryTagValues))
    .optional()
    .describe('Dietary tags if identifiable'),
  allergens: z
    .array(z.enum(allergenValues))
    .optional()
    .describe('Allergens if identifiable'),
  dayOfWeek: z
    .enum(dayOfWeekValues)
    .nullable()
    .optional()
    .describe(
      'Day of the week this dish is offered on, if the menu specifies one (e.g. a weekly menu with different dishes per day). Map Polish day names: poniedziałek=monday, wtorek=tuesday, środa=wednesday, czwartek=thursday, piątek=friday, sobota=saturday, niedziela=sunday. Set to null if no specific day is indicated.'
    ),
});

const extractedOfferSchema = z.object({
  restaurantName: z
    .string()
    .nullable()
    .describe('Name of the restaurant'),
  dishes: z
    .array(extractedDishSchema)
    .describe('List of dishes/offers extracted'),
  address: z
    .string()
    .optional()
    .describe('Restaurant address if found'),
});

const extractionResultSchema = z.object({
  offers: z
    .array(extractedOfferSchema)
    .describe('Extracted lunch offers'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Confidence score from 0 to 1 indicating extraction quality'),
});

// ============================================================================
// Timeout / Fallback Pattern
// ============================================================================

/**
 * Wraps an AI call with a timeout and fallback.
 * Returns the fallback value if the AI call times out or throws.
 */
async function withAIFallback<T>(
  aiCall: () => Promise<T>,
  fallback: () => T,
  timeoutMs: number = 30000
): Promise<T> {
  try {
    const result = await Promise.race([
      aiCall(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI service timeout')), timeoutMs)
      ),
    ]);
    return result;
  } catch (error) {
    console.error('AI service error:', error);
    return fallback();
  }
}

// ============================================================================
// Missing Fields Detection
// ============================================================================

/**
 * Identifies missing required fields from extraction results.
 * Required fields: restaurant name, at least one dish name, price per dish.
 */
function identifyMissingFields(offers: ExtractedOffer[]): string[] {
  const missing: string[] = [];

  if (offers.length === 0) {
    missing.push('restaurantName', 'dishName', 'price');
    return missing;
  }

  for (let i = 0; i < offers.length; i++) {
    const offer = offers[i];
    const prefix = offers.length > 1 ? `offers[${i}].` : '';

    if (!offer.restaurantName) {
      missing.push(`${prefix}restaurantName`);
    }

    if (offer.dishes.length === 0) {
      missing.push(`${prefix}dishName`, `${prefix}price`);
    } else {
      for (let j = 0; j < offer.dishes.length; j++) {
        const dish = offer.dishes[j];
        const dishPrefix =
          offer.dishes.length > 1
            ? `${prefix}dishes[${j}].`
            : `${prefix}`;

        if (!dish.name) {
          missing.push(`${dishPrefix}dishName`);
        }
        if (dish.price === null || dish.price === undefined) {
          missing.push(`${dishPrefix}price`);
        }
      }
    }
  }

  return missing;
}

// ============================================================================
// Empty Fallback
// ============================================================================

function emptyExtraction(sourceType: 'link' | 'text' | 'photo'): ExtractedOffers {
  return {
    offers: [],
    sourceType,
    confidence: 0,
    missingFields: ['restaurantName', 'dishName', 'price'],
  };
}

// ============================================================================
// System Prompt
// ============================================================================

const EXTRACTION_SYSTEM_PROMPT = `You are a lunch offer extraction assistant. Your task is to extract structured lunch offer information from the provided content.

Extract the following information:
- Restaurant name
- Dish names
- Prices (in PLN if possible, otherwise convert to PLN or leave as-is)
- Descriptions of dishes
- Set components (items) — if a lunch offer is a set/zestaw (e.g. soup + main course + drink), extract the individual components as an array of strings. For single dishes, leave items empty.
- Dietary tags (vegetarian, vegan, gluten-free, dairy-free, keto) if identifiable
- Allergens (gluten, orzechy, mleko, jaja, ryby, skorupiaki, soja, seler, gorczyca, sezam) if identifiable
- Day of the week — if the content is a WEEKLY menu where different dishes are offered on different days, set the dayOfWeek for each dish accordingly. Polish day names map as: poniedziałek=monday, wtorek=tuesday, środa=wednesday, czwartek=thursday, piątek=friday, sobota=saturday, niedziela=sunday. If a dish has no specific day, set dayOfWeek to null.
- Restaurant address if available

LANGUAGE:
- ALL human-readable text output (dish names, descriptions, set components/items, restaurant name) MUST be in Polish, regardless of the input language.
- If the source content is in another language, translate the generated text into natural Polish.
- Keep proper names (restaurant brand names) as-is, but write descriptions and item components in Polish.

WEEKLY MENUS:
- If the content shows a menu spanning multiple days (e.g. "Poniedziałek: ...", "Wtorek: ..."), extract EVERY day's dish as a separate dish entry under the same restaurant, each with its own dayOfWeek.
- Do not merge different days into one dish. A 5-day menu should produce at least 5 dish entries.

Rules:
- If you cannot identify a field, set it to null
- Extract ALL dishes/offers you can find
- Group dishes by restaurant
- If a lunch is described as a "zestaw" (set) with multiple components (e.g. "Zupa + drugie danie + napój"), extract those components into the items array
- Set confidence based on how clearly the information was presented (1.0 = very clear, 0.0 = could not extract anything)
- Prices should be numeric values (e.g., 25.00 not "25 zł")
`;

// ============================================================================
// AIAnalyzerService Implementation
// ============================================================================

/**
 * Analyzes a URL to extract lunch offer details.
 * Fetches the URL content and uses AI to extract structured data.
 */
export async function analyzeUrl(url: string): Promise<ExtractedOffers> {
  return withAIFallback(
    async () => {
      const { object } = await generateObject({
        model: google(AI_MODEL_ID),
        schema: extractionResultSchema,
        system: EXTRACTION_SYSTEM_PROMPT,
        prompt: `Extract lunch offer information from the following URL. Analyze the content at this URL and extract all lunch offers you can find:\n\nURL: ${url}`,
      });

      const missingFields = identifyMissingFields(object.offers);

      return {
        offers: object.offers as ExtractedOffer[],
        sourceType: 'link' as const,
        confidence: object.confidence,
        missingFields,
      };
    },
    () => emptyExtraction('link')
  );
}

/**
 * Analyzes pasted text to extract lunch offer details.
 * Validates text length (max 5000 characters) before processing.
 */
export async function analyzeText(text: string): Promise<ExtractedOffers> {
  // Validate text length
  if (!text || text.trim().length === 0) {
    return {
      ...emptyExtraction('text'),
      missingFields: ['restaurantName', 'dishName', 'price'],
    };
  }

  if (text.length > 5000) {
    throw new Error(
      'Text exceeds maximum length of 5000 characters. Please shorten the input.'
    );
  }

  return withAIFallback(
    async () => {
      const { object } = await generateObject({
        model: google(AI_MODEL_ID),
        schema: extractionResultSchema,
        system: EXTRACTION_SYSTEM_PROMPT,
        prompt: `Extract lunch offer information from the following text:\n\n${text}`,
      });

      const missingFields = identifyMissingFields(object.offers);

      return {
        offers: object.offers as ExtractedOffer[],
        sourceType: 'text' as const,
        confidence: object.confidence,
        missingFields,
      };
    },
    () => emptyExtraction('text')
  );
}

/**
 * Analyzes an image (via URL) to extract lunch offer details.
 * Uses a vision-capable model for OCR and content analysis.
 */
export async function analyzeImage(imageUrl: string): Promise<ExtractedOffers> {
  return withAIFallback(
    async () => {
      const { object } = await generateObject({
        model: google(AI_MODEL_ID),
        schema: extractionResultSchema,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract lunch offer information from this image. Perform OCR if needed and identify restaurant names, dish names, prices, and any other relevant details. If this is a WEEKLY menu with dishes assigned to specific days (Poniedziałek, Wtorek, etc.), extract each day\'s dish separately with its dayOfWeek set. IMPORTANT: write all descriptions and set components (items) in Polish, even if the menu is in another language.',
              },
              {
                type: 'image',
                image: imageUrl,
              },
            ],
          },
        ],
      });

      const missingFields = identifyMissingFields(object.offers);

      return {
        offers: object.offers as ExtractedOffer[],
        sourceType: 'photo' as const,
        confidence: object.confidence,
        missingFields,
      };
    },
    () => emptyExtraction('photo')
  );
}
