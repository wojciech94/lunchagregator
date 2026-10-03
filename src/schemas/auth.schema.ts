import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Nieprawidłowy adres e-mail'),
  password: z.string().min(1, 'Hasło jest wymagane'),
});

export const registerSchema = z.object({
  email: z.string().email('Nieprawidłowy adres e-mail'),
  password: z.string().min(8, 'Hasło musi mieć co najmniej 8 znaków'),
});

/**
 * Resending a confirmation needs the address and nothing else. Deliberately no
 * password: the point of the flow is that the User cannot yet sign in, and
 * asking for the password they just chose adds a field to get wrong.
 */
export const emailOnlySchema = z.object({
  email: z.string().email('Nieprawidłowy adres e-mail'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type EmailOnlyInput = z.infer<typeof emailOnlySchema>;
