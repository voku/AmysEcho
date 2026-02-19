import type { Request, Response, NextFunction } from "express";
import rateLimit, { type RateLimitRequestHandler, type Options } from "express-rate-limit";
import auditLogger from "../services/auditLogger.js";
import config from "../config/index.js";
// Import to ensure Express.Request augmentation is loaded
import "../middleware/auth.js";

/**
 * Key generator for user-based rate limiting.
 * Uses user ID when authenticated, falls back to IP address.
 * 
 * This ensures:
 * - Authenticated users are rate limited per account, not per IP
 * - Shared IPs (e.g., corporate networks) don't unfairly limit users
 * - Unauthenticated requests still have IP-based protection
 */
function getUserKey(req: Request): string {
	// Use user ID if authenticated
	if (req.user?.id) {
		return `user:${req.user.id}`;
	}
	
	// Fall back to IP address for unauthenticated requests
	// Use X-Forwarded-For if behind a proxy, otherwise req.ip
	const forwardedFor = req.headers["x-forwarded-for"];
	const ip = typeof forwardedFor === "string"
		? forwardedFor.split(",")[0].trim()
		: req.ip || "unknown";
	
	return `ip:${ip}`;
}

/**
 * Options for creating a user-based rate limiter
 */
export interface UserRateLimitOptions {
	/** Time window in milliseconds (default: 60000 = 1 minute) */
	windowMs?: number;
	/** Maximum requests per window (default: 100) */
	max?: number;
	/** Error message in German */
	message?: string;
	/** Whether to skip logging rate limit events (default: false) */
	skipLogging?: boolean;
}

/**
 * Creates a rate limiter that uses user ID for authenticated requests
 * and falls back to IP for unauthenticated requests.
 * 
 * This provides more accurate rate limiting per user rather than per IP,
 * which is important for:
 * - Shared IP environments (corporate networks, schools)
 * - Users behind NAT
 * - Mobile users switching networks
 */
export function createUserRateLimiter(
	options: UserRateLimitOptions = {},
): RateLimitRequestHandler {
	const {
		windowMs = 60 * 1000, // 1 minute
		max = 100,
		message = "Zu viele Anfragen. Bitte versuche es später erneut.",
		skipLogging = false,
	} = options;

	return rateLimit({
		windowMs,
		max,
		standardHeaders: true,
		legacyHeaders: false,
		keyGenerator: getUserKey,
		message: { error: message, code: "RATE_LIMIT_EXCEEDED" },
		handler: (req: Request, res: Response, _next: NextFunction, optionsUsed: Options) => {
			// Log rate limit event for security monitoring
			if (!skipLogging) {
				auditLogger.logSecurityEvent("RATE_LIMIT_EXCEEDED", {
					userId: req.user?.id,
					ip: req.ip,
					method: req.method,
					path: req.path,
					details: {
						windowMs: optionsUsed.windowMs,
						max: optionsUsed.max,
						key: getUserKey(req),
					},
				}).catch(() => {
					// Ignore audit logging errors
				});
			}

			const retryAfterSecs = Math.ceil(((optionsUsed.windowMs as number | undefined) ?? windowMs) / 1000);
			res.setHeader("Retry-After", String(retryAfterSecs));
			res.status(429).json({
				error: message,
				code: "RATE_LIMIT_EXCEEDED",
			});
		},
	});
}

/**
 * Pre-configured rate limiters for different endpoint types
 */
export const userRateLimiters = {
	/**
	 * Standard API rate limiter (100 requests/minute)
	 */
	standard: createUserRateLimiter({
		windowMs: 60 * 1000,
		max: 100,
	}),

	/**
	 * Strict rate limiter for sensitive operations (10 requests/minute)
	 */
	strict: createUserRateLimiter({
		windowMs: 60 * 1000,
		max: 10,
		message: "Zu viele Anfragen für diese Aktion. Bitte warte einen Moment.",
	}),

	/**
	 * Training rate limiter (configurable via TRAINING_LIMIT)
	 */
	training: createUserRateLimiter({
		windowMs: 60 * 1000,
		max: config.trainingLimit,
		message: "Zu viele Trainingsanfragen. Bitte versuche es später erneut.",
	}),

	/**
	 * Authentication rate limiter (5 requests/minute)
	 * Stricter to prevent brute force attacks
	 */
	auth: createUserRateLimiter({
		windowMs: 60 * 1000,
		max: 5,
		message: "Zu viele Anmeldeversuche. Bitte warte einen Moment.",
	}),

	/**
	 * Model download rate limiter (configurable via MODEL_DOWNLOAD_LIMIT)
	 */
	modelDownload: createUserRateLimiter({
		windowMs: 60 * 1000,
		max: config.modelDownloadLimit,
		message: "Zu viele Modell-Downloads. Bitte versuche es später erneut.",
	}),
};
