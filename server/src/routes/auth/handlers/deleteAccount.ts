import type { Request, Response } from "express";
import {
	deleteProfileData,
	findUserById,
	removeUser,
	saveDatabase,
} from "../../../db.js";
import { AuthService } from "../../../services/authService.js";
import auditLogger from "../../../services/auditLogger.js";
import logger from "../../../services/logger.js";
import { DeleteAccountSchema, normalizeUsername } from "../schemas.js";
import type { AuthRouteDeps } from "../types.js";

const DELETE_CONFIRM_TEXT = "KONTO LÖSCHEN";

/**
 * Handler for DELETE /api/v1/auth/account
 * Deletes the authenticated caregiver account after re-authentication.
 */
export async function handleDeleteAccount(
	req: Request,
	res: Response,
	deps: AuthRouteDeps,
): Promise<Response> {
	if (!req.user) {
		return res.status(401).json({ error: "Sitzung abgelaufen. Bitte neu anmelden." });
	}

	const parsed = DeleteAccountSchema.safeParse(req.body);
	if (!parsed.success) {
		return res.status(400).json({ error: "Nutzername, Passwort und Bestätigung werden benötigt." });
	}

	const username = normalizeUsername(parsed.data.username);
	const password = parsed.data.password;
	const confirmText = parsed.data.confirmText.trim();
	if (confirmText !== DELETE_CONFIRM_TEXT) {
		return res.status(400).json({ error: `Bitte gib zur Bestätigung exakt "${DELETE_CONFIRM_TEXT}" ein.` });
	}

	if (username !== req.user.username) {
		return res.status(403).json({ error: "Nutzername stimmt nicht mit der aktuellen Anmeldung überein." });
	}

	try {
		const accountDeleted = await deps.withFileLock(deps.dbFilePath, async () => {
			const storedUser = findUserById(deps.db, req.user!.id);
			if (!storedUser || storedUser.username !== username) {
				return false;
			}

			const valid = await AuthService.verifyPassword(password, storedUser.passwordHash);
			if (!valid) {
				return false;
			}

			const ownProfiles = deps.db.profiles.filter((profile) => profile.userId === storedUser.id);
			for (const profile of ownProfiles) {
				await deleteProfileData(deps.db, profile.id, deps.dbFilePath);
			}

			removeUser(deps.db, storedUser.id);
			await saveDatabase(deps.db, deps.dbFilePath);
			return true;
		});

		if (!accountDeleted) {
			await auditLogger.logSecurityEvent("AUTHORIZATION_FAILURE", {
				userId: req.user.id,
				ip: req.ip,
				method: req.method,
				path: req.path,
				details: { reason: "delete_account_invalid_credentials" },
			});
			return res.status(401).json({ error: "Anmeldedaten konnten nicht bestätigt werden." });
		}

		await auditLogger.logDataEvent("DATA_DELETE", {
			userId: req.user.id,
			targetResourceType: "account",
			targetResourceId: req.user.id,
			ip: req.ip,
			success: true,
			details: { action: "self_delete" },
		});

		return res.status(200).json({ message: "Konto wurde gelöscht." });
	} catch (error) {
		logger.error("Account deletion failed", {
			userId: req.user.id,
			error: error instanceof Error ? error.message : String(error),
		});
		return res.status(500).json({ error: "Konto konnte nicht gelöscht werden." });
	}
}
