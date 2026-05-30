'use server';

import { cookies } from 'next/headers';

const SESSION_COOKIE_NAME = 'lunch_session_token';
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days in seconds

/**
 * Generates a UUID v4 session token using the Web Crypto API.
 */
export async function generateSessionToken(): Promise<string> {
  return crypto.randomUUID();
}

/**
 * Gets the current session token from cookies.
 * Returns null if no session token exists.
 */
export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE_NAME);
  return cookie?.value ?? null;
}

/**
 * Sets a session token in an httpOnly cookie with secure settings.
 */
export async function setSessionToken(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: '/',
  });
}

/**
 * Gets the current session token or creates a new one if none exists.
 * This is the primary function to use when you need a session token —
 * it ensures a token always exists.
 */
export async function getOrCreateSessionToken(): Promise<string> {
  const existingToken = await getSessionToken();

  if (existingToken) {
    return existingToken;
  }

  const newToken = await generateSessionToken();
  await setSessionToken(newToken);
  return newToken;
}
