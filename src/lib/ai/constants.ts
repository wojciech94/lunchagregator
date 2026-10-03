/**
 * Requirement 4.2 puts the AI response budget at 10 seconds, and both AI
 * services have to honour it. The constant lives here so the analyzer and
 * the recommender cannot drift apart.
 */
export const AI_TIMEOUT_MS = 10000;

/**
 * Thinking off, on every call.
 *
 * Structured extraction against a Zod schema and recommendation from a
 * pre-built list of offers have nothing to reason over, so thinking only adds
 * latency against a budget that is already 10 seconds. `minimal` is rejected
 * by the API as an error, so the budget is zeroed outright.
 *
 * Provider-specific options are namespaced under `providerOptions.google` in
 * this SDK version; there is no top-level `thinkingConfig` setting.
 */
export const GEMINI_THINKING_OFF = {
  google: { thinkingConfig: { thinkingBudget: 0 } },
} as const;