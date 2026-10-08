import { AI_MODEL_ID } from './models';

/**
 * Total AI response budget, shared by the primary and alternate model.
 * Keep it common to extraction and recommendation so a rate-limit fallback
 * has room to finish without resetting the deadline.
 */
export const AI_TIMEOUT_MS = 25000;
export const MAX_AI_TEXT_LENGTH = 5000;

// The legacy numeric budget works for 2.5 Flash, but 3.5 Flash-Lite rejects
// zero with HTTP 400. Use model defaults for other models. This SDK version
// does not support the newer thinkingLevel option; do not silently pass it.
export const GEMINI_PROVIDER_OPTIONS =
  AI_MODEL_ID === 'gemini-2.5-flash' || AI_MODEL_ID === 'gemini-2.5-flash-lite'
    ? { google: { thinkingConfig: { thinkingBudget: 0 } } }
    : undefined;
