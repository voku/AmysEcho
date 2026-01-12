import type { Express, NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { promises as fs } from "fs";
import path from "path";
import { PROFILE_BACKUPS_DIR } from "../constants/profileRegistryPaths.js";
import type { Database } from "../db.js";
import { saveDatabase } from "../db.js";
import {
	buildProfileExportArchive,
	deleteProfileTrainingData,
} from "../services/profileDataService.js";
import type { ProfileRegistry } from "../services/profileRegistry.js";
import { findProfileRecord } from "../services/profileRegistry.js";

type GdprDependencies = {
	authMiddleware: (req: Request, res: Response, next: NextFunction) => void;
	db: Database;
	dbFilePath: string;
	registry: ProfileRegistry;
	registryPath: string;
	saveRegistry: (
		registryPath: string,
		registry: ProfileRegistry,
	) => Promise<void>;
	withFileLock: <T>(filePath: string, callback: () => Promise<T>) => Promise<T>;
	logError: (message: string, metadata?: Record<string, unknown>) => void;
};

export function registerGdprRoutes(app: Express, deps: GdprDependencies): void {
	const {
		authMiddleware,
		db,
		dbFilePath,
		registry,
		registryPath,
		saveRegistry,
		withFileLock,
		logError,
	} = deps;

	const gdprRateLimiter = rateLimit({
		windowMs: 15 * 60 * 1000, // 15 minutes
		max: 10, // limit each IP to 10 GDPR-related requests per windowMs
		standardHeaders: true,
		legacyHeaders: false,
		message: {
			error: "Zu viele Anfragen. Bitte versuchen Sie es später erneut.",
		},
	});

	app.get(
		"/api/v1/profiles/:id/export",
		authMiddleware,
		gdprRateLimiter,
		async (req: Request, res: Response) => {
			const { id } = req.params;
			const profile = findProfileRecord(registry, id);
			if (!profile) {
				res.status(404).json({ error: "Profil nicht gefunden." });
				return;
			}
			try {
				const { buffer, checksum } = await buildProfileExportArchive(
					profile.id,
					registry,
					db,
				);
				res.setHeader("Content-Type", "application/zip");
				res.setHeader(
					"Content-Disposition",
					`attachment; filename="profile_${profile.id}_export.zip"`,
				);
				res.setHeader("X-Profile-Checksum", checksum);
				res.status(200).send(buffer);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logError("Profile export failed", {
					error: message,
					profileId: profile.id,
				});
				res.status(500).json({ error: "Profil-Export fehlgeschlagen." });
			}
		},
	);

	app.delete(
		"/api/v1/profiles/:id",
		authMiddleware,
		gdprRateLimiter,
		async (req: Request, res: Response) => {
			const { id } = req.params;
			try {
				const profile = findProfileRecord(registry, id);
				if (!profile) {
					res.status(404).json({ error: "Profil nicht gefunden." });
					return;
				}
				await withFileLock(dbFilePath, async () => {
					db.profiles = db.profiles.filter((p) => p.id !== profile.id);
					db.usageStats = db.usageStats.filter(
						(u) => u.profileId !== profile.id,
					);
					db.corrections = db.corrections.filter(
						(c) => c.profileId !== profile.id,
					);
					await saveDatabase(db, dbFilePath);
				});
				await deleteProfileTrainingData(profile.id);

				const backupDir = path.join(PROFILE_BACKUPS_DIR, profile.id);
				await fs.rm(backupDir, { recursive: true, force: true });

				await withFileLock(registryPath, async () => {
					registry.profiles = registry.profiles.filter(
						(p) => p.id !== profile.id,
					);
					registry.backups = registry.backups.filter(
						(b) => b.profileId !== profile.id,
					);
					await saveRegistry(registryPath, registry);
				});
				res.json({ status: "deleted" });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logError("Profile deletion failed", { error: message, profileId: id });
				res.status(500).json({ error: "Profil konnte nicht gelöscht werden." });
			}
		},
	);
}
