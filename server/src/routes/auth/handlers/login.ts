import type { Request, Response } from "express";
import { findUserByUsername, updateUser } from "../../../db.js";
import { AuthService } from "../../../services/authService.js";
import auditLogger from "../../../services/auditLogger.js";
import logger from "../../../services/logger.js";
import { LoginSchema, normalizeUsername } from "../schemas.js";
import type { AuthRouteDeps } from "../types.js";

/**
 * Handler for POST /api/v1/auth/login
 * Authenticates a user and returns access/refresh tokens
 */
export async function handleLogin(
	req: Request,
	res: Response,
	deps: AuthRouteDeps,
): Promise<Response> {
	const parsed = LoginSchema.safeParse(req.body);
	if (!parsed.success) {
		return res
			.status(400)
			.json({ error: "Nutzername und Passwort werden benötigt." });
	}

	const username = normalizeUsername(parsed.data.username);
	const password = parsed.data.password;

	try {
		const user = findUserByUsername(deps.db, username);
		const passwordHash = user?.passwordHash ?? AuthService.DUMMY_PASSWORD_HASH;
		const valid = await AuthService.verifyPassword(password, passwordHash);

		if (!user || !valid) {
			// Log failed login attempt
			await auditLogger.logAuth("AUTH_LOGIN_FAILURE", {
				username,
				ip: req.ip,
				userAgent: req.get("User-Agent"),
				success: false,
				details: { reason: !user ? "user_not_found" : "invalid_password" },
			});
			return res.status(401).json({ error: "Ungültige Zugangsdaten." });
		}

		if (!user.emailVerifiedAt) {
			await auditLogger.logAuth("AUTH_LOGIN_FAILURE", {
				userId: user.id,
				username,
				ip: req.ip,
				userAgent: req.get("User-Agent"),
				success: false,
				details: { reason: "email_not_verified" },
			});
			return res
				.status(403)
				.json({
					error:
						"E-Mail-Adresse noch nicht bestätigt. Bitte prüfe deine E-Mails.",
				});
		}

		const publicUser = AuthService.toUser(user);
		const tokens = AuthService.generateTokens(publicUser);

		// Store the refresh token hash for rotation verification
		user.refreshTokenHash = tokens.refreshTokenHash;
		user.refreshTokenIssuedAt = Date.now();
		updateUser(deps.db, user);

		// Log successful login
		await auditLogger.logAuth("AUTH_LOGIN_SUCCESS", {
			userId: publicUser.id,
			username,
			ip: req.ip,
			userAgent: req.get("User-Agent"),
			success: true,
		});

		logger.info("User login", { userId: publicUser.id });

		return res.json({
			user: publicUser,
			tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error("Login failed", { error: message });
		return res.status(500).json({ error: "Anmeldung fehlgeschlagen." });
	}
}
