import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next/headers cookies
const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: mockGet,
    set: mockSet,
  })),
}));

import {
  generateSessionToken,
  getSessionToken,
  setSessionToken,
  getOrCreateSessionToken,
} from '@/lib/session';

describe('lib/session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateSessionToken', () => {
    it('should return a valid UUID v4 string', async () => {
      const token = await generateSessionToken();
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidV4Regex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(token).toMatch(uuidV4Regex);
    });

    it('should generate unique tokens on each call', async () => {
      const token1 = await generateSessionToken();
      const token2 = await generateSessionToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('getSessionToken', () => {
    it('should return the token value when cookie exists', async () => {
      mockGet.mockReturnValue({ value: 'test-session-token-123' });

      const token = await getSessionToken();
      expect(token).toBe('test-session-token-123');
      expect(mockGet).toHaveBeenCalledWith('lunch_session_token');
    });

    it('should return null when cookie does not exist', async () => {
      mockGet.mockReturnValue(undefined);

      const token = await getSessionToken();
      expect(token).toBeNull();
      expect(mockGet).toHaveBeenCalledWith('lunch_session_token');
    });
  });

  describe('setSessionToken', () => {
    it('should set cookie with correct options', async () => {
      await setSessionToken('my-token-abc');

      expect(mockSet).toHaveBeenCalledWith('lunch_session_token', 'my-token-abc', {
        httpOnly: true,
        secure: false, // NODE_ENV is 'test', not 'production'
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      });
    });
  });

  describe('getOrCreateSessionToken', () => {
    it('should return existing token when cookie exists', async () => {
      mockGet.mockReturnValue({ value: 'existing-token' });

      const token = await getOrCreateSessionToken();
      expect(token).toBe('existing-token');
      // Should not set a new cookie
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('should create and set a new token when no cookie exists', async () => {
      mockGet.mockReturnValue(undefined);

      const token = await getOrCreateSessionToken();

      // Should be a valid UUID
      const uuidV4Regex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(token).toMatch(uuidV4Regex);

      // Should have set the cookie
      expect(mockSet).toHaveBeenCalledWith(
        'lunch_session_token',
        token,
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
        })
      );
    });
  });
});
