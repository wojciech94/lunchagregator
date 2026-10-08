import { google } from '@ai-sdk/google';
import { wrapLanguageModel } from 'ai';
import { AI_MODEL_ID, AI_FALLBACK_MODEL_ID } from './models';
import { extractionFailure } from './extraction-errors';

/** One alternate model attempt on HTTP 429, using the caller's deadline. */
export function modelWithRateLimitFallback() {
  async function attempt<T>(primary: () => PromiseLike<T>, fallback: () => PromiseLike<T>, signal?: AbortSignal): Promise<T> {
    try {
      return await primary();
    } catch (error) {
      if (signal?.aborted || AI_MODEL_ID === AI_FALLBACK_MODEL_ID ||
        extractionFailure(error).kind !== 'rateLimit') throw error;
      // The fallback is not wrapped: its failures propagate without a loop.
      return await fallback();
    }
  }

  return wrapLanguageModel({
    model: google(AI_MODEL_ID),
    middleware: {
      wrapGenerate: ({ doGenerate, params }) => attempt(doGenerate, () =>
        google(AI_FALLBACK_MODEL_ID).doGenerate({ ...params, providerMetadata: undefined }), params.abortSignal),
      // Only HTTP failures before a stream opens qualify. Never replay a
      // partially delivered answer or concatenate responses from two models.
      wrapStream: ({ doStream, params }) => attempt(doStream, () =>
        google(AI_FALLBACK_MODEL_ID).doStream({ ...params, providerMetadata: undefined }), params.abortSignal),
    },
  });
}
