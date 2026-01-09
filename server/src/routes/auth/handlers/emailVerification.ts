import { randomBytes } from "crypto";
import type { Request, Response } from "express";
import { findUserByEmail, saveDatabase } from "../../../db.js";
import logger from "../../../services/logger.js";
import {
	EmailVerificationConfirmSchema,
	EmailVerificationRequestSchema,
	normalizeEmail,
} from "../schemas.js";
import {
	EMAIL_VERIFICATION_TTL_MS,
	hashToken,
	isTokenMatch,
	clearEmailVerificationToken,
} from "../tokenUtils.js";
import type { AuthRouteDeps } from "../types.js";

/**
 * Handler for POST /api/v1/auth/verify-email/request
 * Sends an email verification token to the user's email
 */
export async function handleEmailVerificationRequest(
	req: Request,
	res: Response,
	deps: AuthRouteDeps,
): Promise<Response> {
	const parsed = EmailVerificationRequestSchema.safeParse(req.body);
	if (!parsed.success) {
		return res.status(400).json({ error: "E-Mail-Adresse wird benötigt." });
	}

	const email = normalizeEmail(parsed.data.email);

	// Perform crypto operations regardless of user existence to ensure consistent timing
	const verificationToken = randomBytes(24).toString("hex");
	const verificationTokenHash = hashToken(verificationToken);
	const verificationExpiresAt = Date.now() + EMAIL_VERIFICATION_TTL_MS;

	try {
		let userForEmail: { email: string; username: string } | undefined;

		await deps.withFileLock(deps.dbFilePath, async () => {
			const userToUpdate = findUserByEmail(deps.db, email);
			// Only proceed to update DB if user exists and needs verification
			if (userToUpdate && !userToUpdate.emailVerifiedAt) {
				userToUpdate.emailVerificationTokenHash = verificationTokenHash;
				userToUpdate.emailVerificationExpiresAt = verificationExpiresAt;
				userToUpdate.emailVerificationSentAt = Date.now();
				await saveDatabase(deps.db, deps.dbFilePath);
				userForEmail = {
					email: userToUpdate.email,
					username: userToUpdate.username,
				};
			}
		});

		if (userForEmail) {
			await deps.emailService.sendVerificationEmail({
				email: userForEmail.email,
				username: userForEmail.username,
				token: verificationToken,
			});
		}

		return res.status(202).json({
			message:
				"Wenn ein Konto existiert, wurde eine E-Mail mit einem Bestätigungscode gesendet.",
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error("Email verification request failed", { error: message });
		return res
			.status(500)
			.json({ error: "E-Mail-Bestätigung fehlgeschlagen." });
	}
}

/**
 * Handler for POST /api/v1/auth/verify-email/confirm
 * Confirms an email verification and marks the user's email as verified
 */
export async function handleEmailVerificationConfirm(
	req: Request,
	res: Response,
	deps: AuthRouteDeps,
): Promise<Response> {
	const parsed = EmailVerificationConfirmSchema.safeParse(req.body);
	if (!parsed.success) {
		return res
			.status(400)
			.json({ error: "E-Mail-Adresse und Bestätigungscode werden benötigt." });
	}

	const email = normalizeEmail(parsed.data.email);
	const { verificationToken } = parsed.data;

	try {
		const verifiedUser = await deps.withFileLock(deps.dbFilePath, async () => {
			const userToUpdate = findUserByEmail(deps.db, email);
			if (!userToUpdate) return null;

			const verificationHash = userToUpdate.emailVerificationTokenHash;
			const expiresAt = userToUpdate.emailVerificationExpiresAt ?? 0;
			const now = Date.now();

			// Only clear if token is missing or expired
			if (!verificationHash) return null;

			if (expiresAt < now) {
				clearEmailVerificationToken(userToUpdate);
				await saveDatabase(deps.db, deps.dbFilePath);
				return null;
			}

			// Don't clear on mismatch - just reject
			if (!isTokenMatch(verificationToken, verificationHash)) {
				return null;
			}

			// Success path - now clear the token
			userToUpdate.emailVerifiedAt = Date.now();
			clearEmailVerificationToken(userToUpdate);
			await saveDatabase(deps.db, deps.dbFilePath);

			return { id: userToUpdate.id, username: userToUpdate.username };
		});

		if (!verifiedUser) {
			return res
				.status(400)
				.json({ error: "Ungültiger oder abgelaufener Bestätigungscode." });
		}

		logger.info("Email verified", { userId: verifiedUser.id });

		return res.json({
			message: "E-Mail-Adresse wurde bestätigt. Du kannst dich jetzt anmelden.",
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error("Email verification failed", { error: message });
		return res
			.status(500)
			.json({ error: "E-Mail-Bestätigung fehlgeschlagen." });
	}
}
