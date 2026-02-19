import { randomBytes, randomUUID } from "crypto";
import type { Request, Response } from "express";
import {
	addProfile,
	addUser,
	findUserByEmail,
	findUserByUsername,
	saveDatabase,
	seedProfileSymbols,
} from "../../../db.js";
import { AuthService } from "../../../services/authService.js";
import logger from "../../../services/logger.js";
import { ensureProfileRecord } from "../../../services/profileRegistry.js";
import type { StoredUser } from "../../../types.js";
import {
	normalizeEmail,
	normalizeUsername,
	RegistrationSchema,
} from "../schemas.js";
import { EMAIL_VERIFICATION_TTL_MS, hashToken, TOKEN_BYTE_LENGTH } from "../tokenUtils.js";
import type { AuthRouteDeps } from "../types.js";

/**
 * Handler for POST /api/v1/auth/register
 * Creates a new user account and sends an email verification token
 */
export async function handleRegistration(
	req: Request,
	res: Response,
	deps: AuthRouteDeps,
): Promise<Response> {
	const parsed = RegistrationSchema.safeParse(req.body);
	if (!parsed.success) {
		return res
			.status(400)
			.json({
				error: "Nutzername, E-Mail-Adresse und Passwort werden benötigt.",
				details: parsed.error.flatten(),
			});
	}

	const username = normalizeUsername(parsed.data.username);
	const password = parsed.data.password;
	const email = normalizeEmail(parsed.data.email);
	const defaultDisplayName = parsed.data.username.trim();
	const verificationToken = randomBytes(TOKEN_BYTE_LENGTH).toString("hex");
	const verificationTokenHash = hashToken(verificationToken);
	const verificationExpiresAt = Date.now() + EMAIL_VERIFICATION_TTL_MS;

	try {
		const passwordHash = await AuthService.hashPassword(password);
		const result = await deps.withFileLock(deps.registryPath, async () =>
			deps.withFileLock(deps.dbFilePath, async () => {
			const existingUsername = findUserByUsername(deps.db, username);
			const existingEmail = findUserByEmail(deps.db, email);

			if (existingUsername) {
				return { error: "username" };
			}
			if (existingEmail) {
				return { error: "email" };
			}

			const user: StoredUser = {
				id: randomUUID(),
				username,
				email,
				passwordHash,
				displayName: defaultDisplayName,
				role: "caregiver",
				createdAt: Date.now(),
				emailVerificationTokenHash: verificationTokenHash,
				emailVerificationExpiresAt: verificationExpiresAt,
				emailVerificationSentAt: Date.now(),
			};
			addUser(deps.db, user);
			addProfile(deps.db, {
				id: user.id,
				userId: user.id,
				displayName: user.displayName ?? defaultDisplayName,
				createdAt: new Date(user.createdAt).toISOString(),
				metadata: {},
				consentDataUpload: false,
				consentHelpMeGetSmarter: false,
				vocabularySetId: "basic",
			});
			ensureProfileRecord(deps.registry, {
				id: user.id,
				displayName: user.displayName ?? defaultDisplayName,
			});
			// Seed symbols for the user's primary profile (using userId as profileId for now as per current app patterns)
			seedProfileSymbols(deps.db, user.id);
			await deps.saveRegistry(deps.registryPath, deps.registry);
			await saveDatabase(deps.db, deps.dbFilePath);
			return { user };
			}),
		);

		if ("error" in result) {
			// Generic error to prevent user enumeration via different messages
			return res
				.status(409)
				.json({ error: "Benutzername oder E-Mail-Adresse bereits vergeben." });
		}

		// Wrap email send in try-catch
		try {
			await deps.emailService.sendVerificationEmail({
				email: result.user.email,
				username: result.user.username,
				token: verificationToken,
			});

			logger.info("User registered (verification required)", {
				userId: result.user.id,
			});

			return res.status(201).json({
				message:
					"Registrierung erfolgreich. Bitte bestätige deine E-Mail-Adresse.",
			});
		} catch (emailError) {
			logger.error("Verification email send failed after registration", {
				userId: result.user.id,
				error:
					emailError instanceof Error ? emailError.message : String(emailError),
			});

			// User is created, just email failed - allow them to retry
			return res.status(201).json({
				message:
					'Registrierung erfolgreich. Die Bestätigungs-E-Mail konnte nicht gesendet werden. Du kannst die E-Mail über "E-Mail erneut senden" anfordern.',
			});
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error("Registration failed", { error: message });
		return res
			.status(500)
			.json({
				error:
					"Registrierung fehlgeschlagen. E-Mail konnte nicht gesendet werden.",
			});
	}
}
