import { describe, expect, it, vi } from 'vitest';
import { extractionFailure, reportExtractionFailure, EXTRACTION_ERROR_MESSAGES } from './extraction-errors';

describe('safe extraction diagnostics', () => {
  it('unwraps retry errors and reports only allowlisted metadata', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const error = { name: 'AI_RetryError', lastError: { statusCode: 429, message: 'secret-key raw menu', requestBodyValues: { apiKey: 'secret-key' } } };
      expect(reportExtractionFailure(error)).toBe(EXTRACTION_ERROR_MESSAGES.rateLimit);
      expect(spy).toHaveBeenCalledWith('AI extraction failed', { kind: 'rateLimit', statusCode: 429 });
      expect(JSON.stringify(spy.mock.calls)).not.toContain('secret-key');
    } finally { spy.mockRestore(); }
  });

  it('classifies malformed output, missing credentials and network failures', () => {
    expect(extractionFailure({ name: 'AI_NoObjectGeneratedError', cause: { name: 'AI_TypeValidationError' } }).kind).toBe('invalidOutput');
    expect(extractionFailure({ name: 'AI_LoadAPIKeyError' }).kind).toBe('configuration');
    expect(extractionFailure(new TypeError('fetch failed')).kind).toBe('unavailable');
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;
    expect(extractionFailure(cyclic).kind).toBe('unavailable');
  });
});
