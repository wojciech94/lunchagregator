// Feature: user-authentication, Property 1: Zod auth schemas accept valid credentials and reject invalid ones

import { describe, it, expect } from 'vitest';
import { fc } from './fc-config';
import { loginSchema, registerSchema } from '@/schemas/auth.schema';

/**
 * Validates: Requirements 1.2, 1.3, 1.5, 8.4
 *
 * Property 1: Zod auth schemas accept valid credentials and reject invalid ones
 * For any string input to `registerSchema` or `loginSchema`, the schema SHALL return
 * `success: true` if and only if the email is a valid RFC 5322 address (contains `@`
 * and a domain) and the password has length ≥ 8 (for registration) or length ≥ 1
 * (for login); all other inputs SHALL return `success: false` with field-level errors
 * identifying each invalid field.
 */

// --- Generators ---

// Valid email addresses: local@domain.tld
// Constrained to alphanumeric-only local parts and domains to avoid edge cases
// that Zod's email validator (based on HTML5 spec) rejects (e.g. leading dots,
// leading hyphens in domain labels, etc.)
const validEmailArb = fc
  .tuple(
    fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
    fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
    fc.constantFrom('com', 'pl', 'org', 'net', 'io')
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

// Invalid email addresses: strings that definitely lack @ or domain
const invalidEmailArb = fc.oneof(
  // No @ at all
  fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('@')),
  // @ at the very end (no domain)
  fc.string({ minLength: 1, maxLength: 20 }).map((s) => `${s}@`),
  // @ at the very start (no local part)
  fc.string({ minLength: 1, maxLength: 20 }).map((s) => `@${s}`)
);

// Valid passwords for registration (≥ 8 chars)
const validRegisterPasswordArb = fc.string({ minLength: 8, maxLength: 100 });

// Invalid passwords for registration (< 8 chars, including empty)
const invalidRegisterPasswordArb = fc.string({ minLength: 0, maxLength: 7 });

// Valid passwords for login (≥ 1 char)
const validLoginPasswordArb = fc.string({ minLength: 1, maxLength: 100 });

// Invalid password for login (empty string only)
const invalidLoginPasswordArb = fc.constant('');

// --- registerSchema properties ---

describe('Property 1: registerSchema — valid credentials are accepted', () => {
  it('should accept any valid email with password ≥ 8 chars', () => {
    fc.assert(
      fc.property(validEmailArb, validRegisterPasswordArb, (email, password) => {
        const result = registerSchema.safeParse({ email, password });
        expect(result.success).toBe(true);
      })
    );
  });
});

describe('Property 1: registerSchema — invalid email is rejected with field error', () => {
  it('should reject any invalid email and report an email field error', () => {
    fc.assert(
      fc.property(invalidEmailArb, validRegisterPasswordArb, (email, password) => {
        const result = registerSchema.safeParse({ email, password });
        expect(result.success).toBe(false);
        if (!result.success) {
          const emailErrors = result.error.issues.filter((i) => i.path[0] === 'email');
          expect(emailErrors.length).toBeGreaterThan(0);
        }
      })
    );
  });
});

describe('Property 1: registerSchema — password < 8 chars is rejected with field error', () => {
  it('should reject any password shorter than 8 characters and report a password field error', () => {
    fc.assert(
      fc.property(validEmailArb, invalidRegisterPasswordArb, (email, password) => {
        const result = registerSchema.safeParse({ email, password });
        expect(result.success).toBe(false);
        if (!result.success) {
          const passwordErrors = result.error.issues.filter((i) => i.path[0] === 'password');
          expect(passwordErrors.length).toBeGreaterThan(0);
        }
      })
    );
  });
});

describe('Property 1: registerSchema — both fields invalid produces errors for both', () => {
  it('should report field errors for both email and password when both are invalid', () => {
    fc.assert(
      fc.property(invalidEmailArb, invalidRegisterPasswordArb, (email, password) => {
        const result = registerSchema.safeParse({ email, password });
        expect(result.success).toBe(false);
        if (!result.success) {
          const paths = result.error.issues.map((i) => i.path[0]);
          expect(paths).toContain('email');
          expect(paths).toContain('password');
        }
      })
    );
  });
});

// --- loginSchema properties ---

describe('Property 1: loginSchema — valid credentials are accepted', () => {
  it('should accept any valid email with password ≥ 1 char', () => {
    fc.assert(
      fc.property(validEmailArb, validLoginPasswordArb, (email, password) => {
        const result = loginSchema.safeParse({ email, password });
        expect(result.success).toBe(true);
      })
    );
  });
});

describe('Property 1: loginSchema — invalid email is rejected with field error', () => {
  it('should reject any invalid email and report an email field error', () => {
    fc.assert(
      fc.property(invalidEmailArb, validLoginPasswordArb, (email, password) => {
        const result = loginSchema.safeParse({ email, password });
        expect(result.success).toBe(false);
        if (!result.success) {
          const emailErrors = result.error.issues.filter((i) => i.path[0] === 'email');
          expect(emailErrors.length).toBeGreaterThan(0);
        }
      })
    );
  });
});

describe('Property 1: loginSchema — empty password is rejected with field error', () => {
  it('should reject empty password and report a password field error', () => {
    fc.assert(
      fc.property(validEmailArb, invalidLoginPasswordArb, (email, password) => {
        const result = loginSchema.safeParse({ email, password });
        expect(result.success).toBe(false);
        if (!result.success) {
          const passwordErrors = result.error.issues.filter((i) => i.path[0] === 'password');
          expect(passwordErrors.length).toBeGreaterThan(0);
        }
      })
    );
  });
});
