import type { Request, Response, NextFunction } from "express";
import config from "../config/index.js";
import auditLogger from "../services/auditLogger.js";
import logger from "../services/logger.js";

// HSTS configuration constants
const HSTS_MAX_AGE_SECONDS = 31536000; // 1 year
const HSTS_INCLUDE_SUBDOMAINS = true;
const HSTS_PRELOAD = true;

/**
 * Middleware to enforce HTTPS in production.
 * Rejects non-HTTPS requests with 403 Forbidden when NODE_ENV is "production".
 * 
 * Supports common reverse proxy headers:
 * - X-Forwarded-Proto: Standard header set by most load balancers
 * - X-Forwarded-Ssl: Used by some reverse proxies
 * 
 * Allows localhost requests in development/test environments.
 */
export function httpsEnforcement(
	req: Request,
	res: Response,
	next: NextFunction,
): void | Response {
	// Skip enforcement in non-production environments
	if (config.nodeEnv !== "production") {
		return next();
	}

	// Check if request is secure
	// Express sets req.secure based on the protocol
	// Also check X-Forwarded-Proto for reverse proxy setups
	const forwardedProto = req.headers["x-forwarded-proto"];
	const forwardedSsl = req.headers["x-forwarded-ssl"];
	
	const isSecure =
		req.secure ||
		forwardedProto === "https" ||
		forwardedSsl === "on";

	if (!isSecure) {
		// Log to audit trail for security monitoring and compliance
		auditLogger.logSecurityEvent("HTTPS_ENFORCEMENT_BLOCK", {
			method: req.method,
			path: req.path,
			ip: req.ip,
			details: { forwardedProto },
		}).catch(() => { /* ignore audit logging errors */ });

		logger.warn("HTTPS enforcement: Blocked non-HTTPS request", {
			method: req.method,
			path: req.path,
			ip: req.ip,
			forwardedProto,
		});

		return res.status(403).json({
			error: "HTTPS erforderlich. Bitte verwenden Sie eine sichere Verbindung.",
			code: "HTTPS_REQUIRED",
		});
	}

	next();
}

/**
 * Middleware to add HSTS (Strict-Transport-Security) headers.
 * Only adds headers in production to avoid issues during development.
 */
export function hstsHeaders(
	_req: Request,
	res: Response,
	next: NextFunction,
): void {
	// Only add HSTS headers in production
	if (config.nodeEnv === "production") {
		const directives = [
			`max-age=${HSTS_MAX_AGE_SECONDS}`,
			...(HSTS_INCLUDE_SUBDOMAINS ? ["includeSubDomains"] : []),
			...(HSTS_PRELOAD ? ["preload"] : []),
		];
		res.setHeader("Strict-Transport-Security", directives.join("; "));
	}

	next();
}
