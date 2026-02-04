import type { Request, Response } from "express";
import { findUserById, updateUser } from "../../../db.js";
import { AuthService } from "../../../services/authService.js";
import auditLogger from "../../../services/auditLogger.js";
import logger from "../../../services/logger.js";
import { RefreshSchema } from "../schemas.js";
import type { AuthRouteDeps } from "../types.js";

/**
 * Handler for POST /api/v1/auth/refresh
 * Refreshes authentication tokens using a valid refresh token.
 * 
 * Implements refresh token rotation for security:
 * - Each refresh issues a new refresh token
 * - Previous refresh token is invalidated
 * - Detects token reuse (potential theft)
 */
export async function handleRefreshToken(
	req: Request,
	res: Response,
	deps: AuthRouteDeps,
): Promise<Response> {
	const parsed = RefreshSchema.safeParse(req.body);
	if (!parsed.success) {
		return res
			.status(400)
			.json({ error: "Aktualisierungs-Token wird benötigt." });
	}

	try {
		const result = AuthService.refreshTokensWithRotation(
			parsed.data.refreshToken,
			(userId) => findUserById(deps.db, userId),
		);

		if (!result) {
			// Log failed token refresh (potential token reuse or expired token)
			await auditLogger.logAuth("AUTH_TOKEN_REFRESH_FAILURE", {
				ip: req.ip,
				userAgent: req.get("User-Agent"),
				success: false,
				details: { reason: "invalid_or_rotated_token" },
			});
			return res
				.status(401)
				.json({ error: "Sitzung abgelaufen. Bitte neu anmelden." });
		}

		// Persist the new refresh token hash
		const storedUser = findUserById(deps.db, result.user.id);
		if (storedUser) {
			storedUser.refreshTokenHash = result.newRefreshTokenHash;
			storedUser.refreshTokenIssuedAt = Date.now();
			updateUser(deps.db, storedUser);
		}

		// Log successful token refresh
		await auditLogger.logAuth("AUTH_TOKEN_REFRESH", {
			userId: result.user.id,
			username: result.user.username,
			ip: req.ip,
			userAgent: req.get("User-Agent"),
			success: true,
		});

		logger.info("Tokens refreshed with rotation", {
			userId: result.user.id,
			username: result.user.username,
		});

		return res.json({
			user: result.user,
			tokens: result.tokens,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error("Token refresh failed", { error: message });
		return res
			.status(500)
			.json({ error: "Token-Aktualisierung fehlgeschlagen." });
	}
}
