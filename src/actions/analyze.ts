'use server';

import { analyzeUrl, analyzeText, analyzeImage } from '@/services/ai-analyzer';
import type { ExtractedOffers } from '@/services/ai-analyzer';

// ============================================================================
// Types
// ============================================================================

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

// ============================================================================
// Validation Helpers
// ============================================================================

const URL_REGEX = /^https?:\/\/.+/i;
const MAX_TEXT_LENGTH = 5000;

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return URL_REGEX.test(url);
  } catch {
    return false;
  }
}

// ============================================================================
// Server Actions
// ============================================================================

/**
 * Server action to analyze a URL and extract lunch offer details.
 * Validates URL format before calling the AI analyzer service.
 *
 * Validates: Requirements 5.1
 */
export async function analyzeUrlAction(
  url: string
): Promise<ActionResult<ExtractedOffers>> {
  if (!url || url.trim().length === 0) {
    return { success: false, error: 'URL jest wymagany.' };
  }

  if (!isValidUrl(url.trim())) {
    return {
      success: false,
      error: 'Podany URL jest nieprawidłowy. Upewnij się, że zaczyna się od http:// lub https://.',
    };
  }

  try {
    const result = await analyzeUrl(url.trim());
    return { success: true, data: result };
  } catch (error) {
    console.error('analyzeUrlAction error:', error);
    return {
      success: false,
      error: 'Nie udało się przeanalizować podanego URL. Spróbuj ponownie lub wprowadź dane ręcznie.',
    };
  }
}

/**
 * Server action to analyze pasted text and extract lunch offer details.
 * Validates text length (non-empty, max 5000 characters) before calling the AI analyzer service.
 *
 * Validates: Requirements 5.2
 */
export async function analyzeTextAction(
  text: string
): Promise<ActionResult<ExtractedOffers>> {
  if (!text || text.trim().length === 0) {
    return { success: false, error: 'Tekst jest wymagany.' };
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return {
      success: false,
      error: `Tekst przekracza maksymalną długość ${MAX_TEXT_LENGTH} znaków. Skróć wprowadzony tekst.`,
    };
  }

  try {
    const result = await analyzeText(text.trim());
    return { success: true, data: result };
  } catch (error) {
    console.error('analyzeTextAction error:', error);
    return {
      success: false,
      error: 'Nie udało się przeanalizować tekstu. Spróbuj ponownie lub wprowadź dane ręcznie.',
    };
  }
}

/**
 * Server action to analyze an image (via URL) and extract lunch offer details.
 * Validates image URL format before calling the AI analyzer service.
 *
 * Validates: Requirements 5.3
 */
export async function analyzeImageAction(
  imageUrl: string
): Promise<ActionResult<ExtractedOffers>> {
  if (!imageUrl || imageUrl.trim().length === 0) {
    return { success: false, error: 'URL obrazu jest wymagany.' };
  }

  if (!isValidUrl(imageUrl.trim())) {
    return {
      success: false,
      error: 'Podany URL obrazu jest nieprawidłowy. Upewnij się, że zaczyna się od http:// lub https://.',
    };
  }

  try {
    const result = await analyzeImage(imageUrl.trim());
    return { success: true, data: result };
  } catch (error) {
    console.error('analyzeImageAction error:', error);
    return {
      success: false,
      error: 'Nie udało się przeanalizować obrazu. Spróbuj ponownie lub wprowadź dane ręcznie.',
    };
  }
}
