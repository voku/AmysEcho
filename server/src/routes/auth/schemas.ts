import { z } from 'zod';

/**
 * Zod validation schemas for authentication endpoints
 */

export const LoginSchema = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(6).max(128),
});

export const RegistrationSchema = z.object({
  username: z.string().trim().min(3).max(50),
  email: z.string().trim().email().max(254),
  password: z.string().min(6).max(128),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const PasswordResetRequestSchema = z.object({
  email: z.string().trim().email().max(254),
});

export const PasswordResetConfirmSchema = z.object({
  email: z.string().trim().email().max(254),
  resetToken: z.string().min(1),
  password: z.string().min(6).max(128),
});

export const EmailVerificationConfirmSchema = z.object({
  email: z.string().trim().email().max(254),
  verificationToken: z.string().min(1),
});

/**
 * Normalization functions for user inputs
 */
export const normalizeUsername = (username: string): string => username.toLowerCase();
export const normalizeEmail = (email: string): string => email.toLowerCase();
