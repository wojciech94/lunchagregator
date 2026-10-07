import { AI_MODEL_ID } from './models';

/**
 * Requirement 4.2 puts the AI response budget at 10 seconds, and both AI
 * services have to honour it. The constant lives here so the analyzer and
 * the recommender cannot drift apart.
 */
export const AI_TIMEOUT_MS = 10000;

// The legacy numeric budget works for 2.5 Flash, but 3.5 Flash-Lite rejects
// zero with HTTP 400. Use model defaults for other models. This SDK version
// does not support the newer thinkingLevel option; do not silently pass it.
export const GEMINI_PROVIDER_OPTIONS =
  AI_MODEL_ID === 'gemini-2.5-flash' || AI_MODEL_ID === 'gemini-2.5-flash-lite'
    ? { google: { thinkingConfig: { thinkingBudget: 0 } } }
    : undefined;
