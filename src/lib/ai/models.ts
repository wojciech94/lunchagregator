/**
 * The single model used by every AI service in this app.
 *
 * Google Gemini free tier. `gemini-3.8-flash` covers all three analyzer
 * inputs (text, image, url) and structured output extraction, so there is
 * deliberately one constant rather than one per service.
 *
 * `AI_MODEL` is an override for experimentation, not a requirement.
 */
export const AI_MODEL_ID = process.env.AI_MODEL ?? 'gemini-3.8-flash';