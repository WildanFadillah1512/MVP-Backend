import { z } from 'zod';

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Format email tidak valid'),
    password: z.string().min(6, 'Password minimal 6 karakter'),
  }),
});

export const verifyOtpSchema = z.object({
  body: z.object({
    otpToken: z.string().min(20, 'Token OTP tidak valid'),
    code: z.string().regex(/^\d{6}$/, 'Kode OTP harus 6 digit angka'),
  }),
});
