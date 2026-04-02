import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { type Database, findUserById, saveDatabase } from "../db.js";
import { AuthService } from "../services/authService.js";
import logger from "../services/logger.js";
import type { StoredUser } from "../types.js";
import { withFileLock } from "../utils/fileLock.js";

interface UserRouteDeps {
	db: Database;
	dbFilePath: string;
	authMiddleware: (req: Request, res: Response, next: NextFunction) => void;
}

const ProfileUpdateSchema = z
	.object({
		displayName: z.string().trim().min(1).max(120).optional(),
		userId: z.string().optional(),
	})
	.strict();

const PasswordUpdateSchema = z
	.object({
		currentPassword: z.string().min(6).max(128),
		newPassword: z.string().min(6).max(128),
		userId: z.string().optional(),
	})
	.strict();

const toUserProfile = (user: StoredUser) => ({
	id: user.id,
	username: user.username,
	email: user.email,
	displayName: user.displayName ?? "",
});

const isVerifiedUser = (user: StoredUser) => Boolean(user.emailVerifiedAt);

export function registerUserRoutes(
	app: import("express").Express,
	deps: UserRouteDeps,
) {
	app.put(
		"/api/v1/account/profile",
		deps.authMiddleware,
		async (req: Request, res: Response) => {
				const parsed = ProfileUpdateSchema.safeParse(req.body);
				if (!parsed.success) {
					return res
					.status(400)
					.json({
						error: "Ungültige Profildaten.",
						details: parsed.error.flatten(),
					});
			}

			if (parsed.data.userId) {
				return res
					.status(403)
					.json({ error: "Änderungen für andere Konten sind nicht erlaubt." });
			}

			const userId = req.user?.id;
			if (!userId) {
				return res.status(401).json({ error: "Nicht angemeldet." });
			}

			try {
				const updated = await withFileLock(deps.dbFilePath, async () => {
					const user = findUserById(deps.db, userId);
					if (!user) return null;
					if (!isVerifiedUser(user)) return "unverified" as const;

					if (typeof parsed.data.displayName === "string") {
						user.displayName = parsed.data.displayName;
					}
					await saveDatabase(deps.db, deps.dbFilePath);
					return user;
				});

				if (updated === "unverified") {
					return res
						.status(403)
						.json({ error: "Bitte bestätige zuerst deine E-Mail-Adresse." });
				}
				if (!updated) {
					return res
						.status(404)
						.json({ error: "Benutzerkonto nicht gefunden." });
				}

				return res.json({ user: toUserProfile(updated) });
			} catch (error) {
				logger.error("Profile update failed", {
					error: error instanceof Error ? error.message : String(error),
				});
				return res
					.status(500)
					.json({ error: "Profilaktualisierung fehlgeschlagen." });
			}
		},
	);

	app.put(
		"/api/v1/account/password",
		deps.authMiddleware,
		async (req: Request, res: Response) => {
				const parsed = PasswordUpdateSchema.safeParse(req.body);
				if (!parsed.success) {
					return res
					.status(400)
					.json({
						error: "Ungültige Passwortdaten.",
						details: parsed.error.flatten(),
					});
			}

			if (parsed.data.userId) {
				return res
					.status(403)
					.json({ error: "Änderungen für andere Konten sind nicht erlaubt." });
			}

			const userId = req.user?.id;
			if (!userId) {
				return res.status(401).json({ error: "Nicht angemeldet." });
			}

			try {
				const updated = await withFileLock(deps.dbFilePath, async () => {
					const user = findUserById(deps.db, userId);
					if (!user) return null;
					if (!isVerifiedUser(user)) return "unverified" as const;

					const valid = await AuthService.verifyPassword(
						parsed.data.currentPassword,
						user.passwordHash,
					);
					if (!valid) return "invalid" as const;

					user.passwordHash = await AuthService.hashPassword(
						parsed.data.newPassword,
					);
					await saveDatabase(deps.db, deps.dbFilePath);
					return user;
				});

				if (updated === "unverified") {
					return res
						.status(403)
						.json({ error: "Bitte bestätige zuerst deine E-Mail-Adresse." });
				}
				if (updated === "invalid") {
					return res
						.status(400)
						.json({ error: "Aktuelles Passwort ist falsch." });
				}
				if (!updated) {
					return res
						.status(404)
						.json({ error: "Benutzerkonto nicht gefunden." });
				}

				return res.json({ message: "Passwort wurde aktualisiert." });
			} catch (error) {
				logger.error("Password update failed", {
					error: error instanceof Error ? error.message : String(error),
				});
				return res
					.status(500)
					.json({ error: "Passwortänderung fehlgeschlagen." });
			}
		},
	);
}
