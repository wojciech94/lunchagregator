// Feature: user-authentication, Property 1: Zod auth schemas accept valid credentials and reject invalid ones

import { describe, expect, it } from 'vitest';
import { fc } from '../../__tests__/properties/fc-config';
import { loginSchema, registerSchema } from './auth.schema';

/** Validates: Requirements 1.2, 1.3, 1.5, 8.4 */

const characterArb = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789');
const tokenArb = (minLength: number, maxLength: number) =>
  fc.array(characterArb, { minLength, maxLength }).map((characters) => characters.join(''));
const validEmailArb = fc
  .tuple(tokenArb(1, 20), tokenArb(1, 20), fc.constantFrom('com', 'pl', 'io'))
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);
const invalidEmailArb = fc.oneof(
  fc.constant(''),
  tokenArb(1, 30).map((local) => `${local}example.com`),
  tokenArb(1, 30).map((local) => `${local}@`),
  tokenArb(1, 30).map((domain) => `@${domain}.com`)
);
const loginPasswordArb = fc.string({ minLength: 1, maxLength: 64 });
const registerPasswordArb = fc.string({ minLength: 8, maxLength: 64 });
const shortPasswordArb = fc.string({ minLength: 0, maxLength: 7 });

type InvalidField = 'email' | 'password';

function expectFieldErrors(
  result: ReturnType<typeof loginSchema.safeParse>,
  invalidFields: readonly InvalidField[]
) {
  expect(result.success).toBe(false);
  if (result.success) return;

  const fieldErrors = result.error.flatten().fieldErrors;
  for (const field of invalidFields) expect(fieldErrors[field]).toBeDefined();
}

describe('Property 1: Zod auth schemas accept valid credentials and reject invalid ones', () => {
  it('accepts every generated valid login and registration credential pair', () => {
    fc.assert(
      fc.property(validEmailArb, loginPasswordArb, registerPasswordArb, (email, loginPassword, registerPassword) => {
        expect(loginSchema.safeParse({ email, password: loginPassword }).success).toBe(true);
        expect(registerSchema.safeParse({ email, password: registerPassword }).success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects generated malformed emails with an email field error', () => {
    fc.assert(
      fc.property(invalidEmailArb, loginPasswordArb, registerPasswordArb, (email, loginPassword, registerPassword) => {
        expectFieldErrors(loginSchema.safeParse({ email, password: loginPassword }), ['email']);
        expectFieldErrors(registerSchema.safeParse({ email, password: registerPassword }), ['email']);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects missing login passwords and short registration passwords with password field errors', () => {
    fc.assert(
      fc.property(validEmailArb, shortPasswordArb, (email, password) => {
        expectFieldErrors(loginSchema.safeParse({ email, password: '' }), ['password']);
        expectFieldErrors(registerSchema.safeParse({ email, password }), ['password']);
      }),
      { numRuns: 100 }
    );
  });

  it('reports every invalid field when both registration credentials are invalid', () => {
    fc.assert(
      fc.property(invalidEmailArb, shortPasswordArb, (email, password) => {
        expectFieldErrors(registerSchema.safeParse({ email, password }), ['email', 'password']);
      }),
      { numRuns: 100 }
    );
  });
});