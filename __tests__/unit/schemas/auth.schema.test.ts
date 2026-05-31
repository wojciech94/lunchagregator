import { describe, it, expect } from 'vitest';
import { loginSchema, registerSchema } from '@/schemas/auth.schema';

describe('loginSchema', () => {
  describe('valid inputs', () => {
    it('accepts valid email and non-empty password', () => {
      const result = loginSchema.safeParse({ email: 'user@example.com', password: 'secret' });
      expect(result.success).toBe(true);
    });

    it('accepts password of exactly 1 character', () => {
      const result = loginSchema.safeParse({ email: 'user@example.com', password: 'x' });
      expect(result.success).toBe(true);
    });

    it('accepts password longer than 8 characters', () => {
      const result = loginSchema.safeParse({ email: 'user@example.com', password: 'longpassword123' });
      expect(result.success).toBe(true);
    });
  });

  describe('email validation', () => {
    it('rejects missing @ sign', () => {
      const result = loginSchema.safeParse({ email: 'invalidemail', password: 'pass' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const emailErrors = result.error.issues.filter((i) => i.path[0] === 'email');
        expect(emailErrors.length).toBeGreaterThan(0);
      }
    });

    it('rejects email without domain', () => {
      const result = loginSchema.safeParse({ email: 'user@', password: 'pass' });
      expect(result.success).toBe(false);
    });

    it('rejects empty email', () => {
      const result = loginSchema.safeParse({ email: '', password: 'pass' });
      expect(result.success).toBe(false);
    });

    it('rejects email without local part', () => {
      const result = loginSchema.safeParse({ email: '@example.com', password: 'pass' });
      expect(result.success).toBe(false);
    });

    it('returns correct error message for invalid email', () => {
      const result = loginSchema.safeParse({ email: 'bad', password: 'pass' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const emailError = result.error.issues.find((i) => i.path[0] === 'email');
        expect(emailError?.message).toBe('Nieprawidłowy adres e-mail');
      }
    });
  });

  describe('password validation', () => {
    it('rejects empty password', () => {
      const result = loginSchema.safeParse({ email: 'user@example.com', password: '' });
      expect(result.success).toBe(false);
    });

    it('returns correct error message for empty password', () => {
      const result = loginSchema.safeParse({ email: 'user@example.com', password: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const passwordError = result.error.issues.find((i) => i.path[0] === 'password');
        expect(passwordError?.message).toBe('Hasło jest wymagane');
      }
    });
  });

  describe('missing fields', () => {
    it('rejects missing email', () => {
      const result = loginSchema.safeParse({ password: 'pass' });
      expect(result.success).toBe(false);
    });

    it('rejects missing password', () => {
      const result = loginSchema.safeParse({ email: 'user@example.com' });
      expect(result.success).toBe(false);
    });

    it('rejects empty object', () => {
      const result = loginSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});

describe('registerSchema', () => {
  describe('valid inputs', () => {
    it('accepts valid email and password of exactly 8 characters', () => {
      const result = registerSchema.safeParse({ email: 'user@example.com', password: '12345678' });
      expect(result.success).toBe(true);
    });

    it('accepts password longer than 8 characters', () => {
      const result = registerSchema.safeParse({ email: 'user@example.com', password: 'securepassword' });
      expect(result.success).toBe(true);
    });

    it('accepts various valid email formats', () => {
      const emails = [
        'user@example.com',
        'user.name+tag@sub.domain.org',
        'user123@test.co.uk',
      ];
      for (const email of emails) {
        const result = registerSchema.safeParse({ email, password: 'password123' });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('email validation', () => {
    it('rejects invalid email format', () => {
      const result = registerSchema.safeParse({ email: 'notanemail', password: 'password123' });
      expect(result.success).toBe(false);
    });

    it('rejects empty email', () => {
      const result = registerSchema.safeParse({ email: '', password: 'password123' });
      expect(result.success).toBe(false);
    });

    it('returns correct error message for invalid email', () => {
      const result = registerSchema.safeParse({ email: 'bad', password: 'password123' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const emailError = result.error.issues.find((i) => i.path[0] === 'email');
        expect(emailError?.message).toBe('Nieprawidłowy adres e-mail');
      }
    });
  });

  describe('password validation', () => {
    it('rejects password shorter than 8 characters (7 chars)', () => {
      const result = registerSchema.safeParse({ email: 'user@example.com', password: '1234567' });
      expect(result.success).toBe(false);
    });

    it('rejects empty password', () => {
      const result = registerSchema.safeParse({ email: 'user@example.com', password: '' });
      expect(result.success).toBe(false);
    });

    it('rejects password of 1 character', () => {
      const result = registerSchema.safeParse({ email: 'user@example.com', password: 'x' });
      expect(result.success).toBe(false);
    });

    it('returns correct error message for short password', () => {
      const result = registerSchema.safeParse({ email: 'user@example.com', password: 'short' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const passwordError = result.error.issues.find((i) => i.path[0] === 'password');
        expect(passwordError?.message).toBe('Hasło musi mieć co najmniej 8 znaków');
      }
    });
  });

  describe('missing fields', () => {
    it('rejects missing email', () => {
      const result = registerSchema.safeParse({ password: 'password123' });
      expect(result.success).toBe(false);
    });

    it('rejects missing password', () => {
      const result = registerSchema.safeParse({ email: 'user@example.com' });
      expect(result.success).toBe(false);
    });

    it('rejects empty object', () => {
      const result = registerSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
