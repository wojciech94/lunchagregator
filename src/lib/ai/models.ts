/**
 * The primary and rate-limit fallback models shared by the AI services.
 *
 * Flash-Lite keeps menu extraction within the interactive latency budget.
 * Availability/pricing and project quotas must be checked in AI Studio;
 * a model name alone does not guarantee free access or successful requests.
 * URL retrieval remains separate from the model's text/image capabilities.
 *
 * `AI_MODEL` is an override for experimentation, not a requirement.
 */
export const AI_MODEL_ID = process.env.AI_MODEL ?? 'gemini-3.5-flash-lite';
export const AI_FALLBACK_MODEL_ID = process.env.AI_FALLBACK_MODEL ?? 'gemini-3.1-flash-lite';
