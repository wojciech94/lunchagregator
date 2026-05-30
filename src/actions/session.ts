'use server';

import {
  getSessionToken,
  getOrCreateSessionToken,
  setSessionToken,
  generateSessionToken,
} from '@/lib/session';

/**
 * Server action to get the current session token.
 * Returns null if no session exists yet.
 */
export async function getCurrentSessionToken(): Promise<string | null> {
  return getSessionToken();
}

/**
 * Server action to ensure a session token exists.
 * Creates a new one if none is present, otherwise returns the existing one.
 * This should be called when a user performs an action that requires identification
 * (e.g., creating an offer).
 */
export async function ensureSessionToken(): Promise<string> {
  return getOrCreateSessionToken();
}

/**
 * Server action to create a fresh session token.
 * This replaces any existing session token with a new one.
 * Use with caution — this will disassociate the user from their previous offers.
 */
export async function createNewSessionToken(): Promise<string> {
  const token = await generateSessionToken();
  await setSessionToken(token);
  return token;
}
