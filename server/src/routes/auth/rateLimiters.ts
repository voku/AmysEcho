import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

function getEmailRateLimitKey(req: Request): string {
	const email =
		typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
	if (email.length > 0) {
		return `email:${email}`;
	}
	const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
	return `ip:${ipKeyGenerator(ip)}`;
}

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
 * Rate limiter for requesting verification emails.
 * Keeps resend abuse in check without locking normal retry behavior.
 */
export const createEmailVerificationRequestLimiter = () =>
	rateLimit({
		windowMs: 15 * 60 * 1000,
		max: 8,
		standardHeaders: true,
		legacyHeaders: false,
		keyGenerator: getEmailRateLimitKey,
		message: {
			error:
				"Zu viele Anfragen zur E-Mail-Bestätigung. Bitte warte kurz und versuche es erneut.",
		},
	});

/**
 * Rate limiter for entering verification codes.
 * Separate from resend requests so repeated email requests don't block confirmation.
 */
export const createEmailVerificationConfirmLimiter = () =>
	rateLimit({
		windowMs: 15 * 60 * 1000,
		max: 20,
		standardHeaders: true,
		legacyHeaders: false,
		keyGenerator: getEmailRateLimitKey,
		skipSuccessfulRequests: true,
		message: {
			error:
				"Zu viele Bestätigungscode-Versuche. Bitte warte kurz und versuche es erneut.",
		},
	});
