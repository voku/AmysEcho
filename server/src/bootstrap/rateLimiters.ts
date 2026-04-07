import rateLimit from "express-rate-limit";
import config from "../config/index.js";

export function createServerRateLimiters() {
	const apiLimiter = rateLimit({
		windowMs: 60 * 1000,
		max: config.apiLimit,
		standardHeaders: true,
		legacyHeaders: false,
	});

	const modelMetadataLimiter = rateLimit({
		windowMs: 60 * 1000,
		max: config.modelMetadataLimit,
		standardHeaders: true,
		legacyHeaders: false,
	});

	const trainingLimiter = rateLimit({
		windowMs: 60 * 1000,
		max: config.trainingLimit,
		standardHeaders: true,
		legacyHeaders: false,
		message: "Zu viele Trainingsanfragen. Bitte versuche es später erneut.",
		handler: (_req, res, _next, optionsUsed) => {
			const retryAfterSecs = Math.ceil(((optionsUsed.windowMs as number | undefined) ?? 60_000) / 1000);
			res.setHeader("Retry-After", String(retryAfterSecs));
			res.status(429).json({ error: "Zu viele Trainingsanfragen. Bitte versuche es später erneut." });
		},
	});

	const healthLimiter = rateLimit({
		windowMs: 1000,
		max: 100,
		standardHeaders: true,
		legacyHeaders: false,
	});

	return { apiLimiter, modelMetadataLimiter, trainingLimiter, healthLimiter };
}
