import { RATE_LIMIT_MESSAGE } from './errors';

export const EXTRACTION_ERROR_MESSAGES = {
  rateLimit: RATE_LIMIT_MESSAGE,
  timeout: 'Analiza AI trwała zbyt długo. Spróbuj ponownie lub wprowadź dane ręcznie.',
  configuration: 'Usługa analizy AI nie jest poprawnie skonfigurowana. Spróbuj później lub wprowadź dane ręcznie.',
  invalidOutput: 'AI zwróciło nieprawidłowe dane oferty. Spróbuj ponownie lub wprowadź dane ręcznie.',
  unavailable: 'Usługa analizy AI jest chwilowo niedostępna. Spróbuj ponownie lub wprowadź dane ręcznie.',
} as const;

type FailureKind = keyof typeof EXTRACTION_ERROR_MESSAGES;

export class ExtractionTimeoutError extends Error {
  constructor() {
    super('Extraction deadline exceeded');
    this.name = 'ExtractionTimeoutError';
  }
}

/** Inspect SDK wrappers without exposing messages, request bodies or headers. */
export function extractionFailure(error: unknown): { kind: FailureKind; statusCode?: number } {
  const pending: unknown[] = [error];
  const seen = new Set<unknown>();
  let invalidOutput = false;
  while (pending.length && seen.size < 12) {
    const item = pending.shift();
    if (!item || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    const candidate = item as { name?: unknown; statusCode?: unknown; status?: unknown; cause?: unknown; lastError?: unknown; errors?: unknown };
    const name = typeof candidate.name === 'string' ? candidate.name : '';
    if (name === 'ExtractionTimeoutError' || name === 'TimeoutError' || name === 'AbortError') return { kind: 'timeout' };
    const status = candidate.statusCode ?? candidate.status;
    if (status === 429) return { kind: 'rateLimit', statusCode: status };
    if (status === 400 || status === 401 || status === 403 || status === 404 || name === 'AI_LoadAPIKeyError' || name === 'AI_NoSuchModelError') {
      return { kind: 'configuration', ...(typeof status === 'number' ? { statusCode: status } : {}) };
    }
    if (typeof status === 'number' && status >= 500) return { kind: 'unavailable', statusCode: status };
    invalidOutput ||= /NoObjectGenerated|JSONParse|TypeValidation|InvalidResponseData/.test(name);
    pending.push(candidate.lastError, candidate.cause);
    if (Array.isArray(candidate.errors)) pending.push(...candidate.errors.slice(-3).reverse());
  }
  return { kind: invalidOutput ? 'invalidOutput' : 'unavailable' };
}

export function reportExtractionFailure(error: unknown): string {
  const failure = extractionFailure(error);
  // Only allowlisted metadata. SDK errors may contain credentials and raw input.
  console.error('AI extraction failed', failure);
  return EXTRACTION_ERROR_MESSAGES[failure.kind];
}
