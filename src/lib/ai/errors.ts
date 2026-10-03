/**
 * Rate limiting is an expected operating condition on the free tier, not an
 * edge case. Free-tier RPM/TPM/RPD limits are undocumented publicly, counted
 * per project rather than per key, and shared across developers, so a 429
 * arrives under normal use.
 *
 * There is no spend-based cap on the free tier, so a 429 cannot cost the
 * user money — but left unhandled it looks identical to "the model found
 * nothing", which is not what happened.
 */

export const RATE_LIMIT_MESSAGE =
  'AI jest chwilowo zajęty. Spróbuj ponownie za chwilę.';

/**
 * True when an error is a rate-limit rejection from the AI provider.
 *
 * Checks the HTTP status first, then falls back to the message text, because
 * SDK versions differ in whether they surface a status code on the error.
 */
export function isRateLimitError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as { statusCode?: unknown; status?: unknown };
  const status = candidate.statusCode ?? candidate.status;
  if (status === 429) {
    return true;
  }

  const message =
    'message' in error && typeof error.message === 'string'
      ? error.message
      : '';
  return message.includes('429') || /rate.?limit/i.test(message);
}