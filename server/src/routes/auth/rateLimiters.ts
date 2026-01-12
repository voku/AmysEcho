import rateLimit from "express-rate-limit";

/**
 * Rate limiter for general authentication endpoints (login, register)
 * 5 requests per 15 minutes
 */
export const createAuthLimiter = () =>
	rateLimit({
		windowMs: 15 * 60 * 1000,
		max: 5,
		standardHeaders: true,
		legacyHeaders: false,
		message: {
			error: "Zu viele Anmeldeversuche. Bitte später erneut versuchen.",
		},
	});

/**
 * Rate limiter for token refresh endpoint
 * 20 requests per 15 minutes
 */
export const createRefreshLimiter = () =>
	rateLimit({
		windowMs: 15 * 60 * 1000,
		max: 20,
		standardHeaders: true,
		legacyHeaders: false,
		message: {
			error: "Zu viele Aktualisierungsversuche. Bitte später erneut versuchen.",
		},
	});

/**
 * Rate limiter for password reset endpoints
 * 5 requests per 15 minutes
 */
export const createPasswordResetLimiter = () =>
	rateLimit({
		windowMs: 15 * 60 * 1000,
		max: 5,
		standardHeaders: true,
		legacyHeaders: false,
		message: {
			error: "Zu viele Passwort-Reset-Anfragen. Bitte später erneut versuchen.",
		},
	});

/**
 * Rate limiter for email verification endpoints
 * 5 requests per hour
 */
export const createEmailVerificationLimiter = () =>
	rateLimit({
		windowMs: 60 * 60 * 1000, // 1 hour
		max: 5,
		standardHeaders: true,
		legacyHeaders: false,
		message: { error: "Zu viele Anfragen. Bitte versuche es später erneut." },
	});
