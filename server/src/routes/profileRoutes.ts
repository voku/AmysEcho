import type { Express, NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import {
	MLP_MODELS_DIR,
	PROFILE_ID_PATTERN,
	TRAINING_UPLOADS_DIR,
} from "../constants/modelPaths.js";
import { PROFILE_BACKUPS_DIR } from "../constants/profileRegistryPaths.js";
import type { Database } from "../db.js";
import { saveDatabase } from "../db.js";
import {
	buildProfileExportArchive,
	deleteProfileTrainingData,
	listProfileBackups,
	loadCustomSigns,
	loadDgsSamples,
	loadTrainingManifest,
	restoreProfileFromArchive,
	saveCustomSigns,
	saveDgsSamples,
	saveTrainingManifest,
	writeProfileBackup,
} from "../services/profileDataService.js";
import {
	attachCaregiver,
	createShareToken,
	createSyncToken,
	ensureProfileRecord,
	findProfileRecord,
	type ProfileRegistry,
	redeemShareToken,
	redeemSyncToken,
	registerDevice,
	updateProfileRecord,
} from "../services/profileRegistry.js";
import { isProfileAuthorized } from "../utils/profileAuthorization.js";

type ProfileRouteDeps = {
	authMiddleware: (req: Request, res: Response, next: NextFunction) => void;
	db: Database;
	dbFilePath: string;
	registry: ProfileRegistry;
	registryPath: string;
	withFileLock: <T>(filePath: string, callback: () => Promise<T>) => Promise<T>;
	saveRegistry: (
		registryPath: string,
		registry: ProfileRegistry,
	) => Promise<void>;
	logError: (message: string, metadata?: Record<string, unknown>) => void;
};

const ProfileCreateSchema = z.object({
	id: z.string().regex(PROFILE_ID_PATTERN).optional(),
	displayName: z.string().trim().min(1),
	metadata: z
		.object({
			ageYears: z.number().min(0).max(30).optional(),
			birthDate: z.string().optional(),
			primaryLanguage: z.string().optional(),
			notes: z.string().optional(),
		})
		.optional(),
});

const ProfileUpdateSchema = z.object({
	displayName: z.string().trim().min(1).optional(),
	metadata: z
		.object({
			ageYears: z.number().min(0).max(30).optional(),
			birthDate: z.string().optional(),
			primaryLanguage: z.string().optional(),
			notes: z.string().optional(),
		})
		.optional(),
});

const MergeSchema = z.object({
	sourceProfileId: z.string().min(1),
	mode: z.enum(["merge", "transfer"]).optional(),
});

const ShareSchema = z.object({
	permissions: z.enum(["read", "write"]),
});

const AcceptShareSchema = z.object({
	token: z.string().min(1),
});

const SyncTokenSchema = z.object({
	deviceId: z.string().optional(),
	deviceName: z.string().optional(),
});

const SyncRedeemSchema = z.object({
	token: z.string().min(1),
	deviceId: z.string().optional(),
	deviceName: z.string().optional(),
});

const SyncRestoreSchema = z.object({
	archiveBase64: z.string().min(1),
});

const BackupRestoreSchema = z.object({
	backupPath: z.string().min(1),
});

async function mergeProfileDirectories(
	sourceId: string,
	targetId: string,
): Promise<void> {
	const sourceUploads = path.join(TRAINING_UPLOADS_DIR, sourceId);
	const targetUploads = path.join(TRAINING_UPLOADS_DIR, targetId);
	await mergeDirectoryContents(sourceUploads, targetUploads);

	const sourceModels = path.join(MLP_MODELS_DIR, sourceId);
	const targetModels = path.join(MLP_MODELS_DIR, targetId);
	await mergeDirectoryContents(sourceModels, targetModels);
}

async function mergeDirectoryContents(
	sourceDir: string,
	targetDir: string,
): Promise<void> {
	try {
		await fs.stat(sourceDir);
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
			return;
		}
		throw error;
	}
	await fs.mkdir(targetDir, { recursive: true });
	const entries = await fs.readdir(sourceDir);
	for (const entry of entries) {
		const sourcePath = path.join(sourceDir, entry);
		let targetPath = path.join(targetDir, entry);
		if (
			await fs
				.stat(targetPath)
				.then(() => true)
				.catch((error) => {
					if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return false;
					throw error;
				})
		) {
			const ext = path.extname(entry);
			const base = path.basename(entry, ext);
			const uniqueName = `${base}-${Date.now()}${ext}`;
			targetPath = path.join(targetDir, uniqueName);
		}
		await fs.rename(sourcePath, targetPath);
	}
	await fs.rm(sourceDir, { recursive: true, force: true });
}

async function mergeProfileData(
	db: Database,
	sourceId: string,
	targetId: string,
): Promise<void> {
	db.usageStats = db.usageStats.map((stat) =>
		stat.profileId === sourceId ? { ...stat, profileId: targetId } : stat,
	);
	db.corrections = db.corrections.map((corr) =>
		corr.profileId === sourceId ? { ...corr, profileId: targetId } : corr,
	);

	const manifest = await loadTrainingManifest();
	for (const entry of manifest.entries) {
		if (entry.profileId === sourceId) {
			entry.profileId = targetId;
		}
	}
	await saveTrainingManifest(manifest);

	const samples = await loadDgsSamples();
	for (const sample of samples.samples) {
		if (sample.profileId === sourceId) {
			sample.profileId = targetId;
		}
	}
	await saveDgsSamples(samples);

	const customSigns = await loadCustomSigns();
	for (const sign of customSigns.signs) {
		if (sign.profileId === sourceId) {
			sign.profileId = targetId;
		}
	}
	await saveCustomSigns(customSigns);

	await mergeProfileDirectories(sourceId, targetId);
}

export function registerProfileRoutes(
	app: Express,
	deps: ProfileRouteDeps,
): void {
	const {
		authMiddleware,
		db,
		dbFilePath,
		registry,
		registryPath,
		withFileLock,
		saveRegistry,
		logError,
	} = deps;

	const backupRestoreRateLimiter = rateLimit({
		windowMs: 15 * 60 * 1000, // 15 minutes
		max: 20, // limit each IP to 20 backup/restore requests per windowMs
		standardHeaders: true,
		legacyHeaders: false,
	});

	app.get("/api/v1/profiles", authMiddleware, (req, res) => {
		// Only return profiles the user has access to
		if (!req.user?.id) {
			return res.status(401).json({ error: "Authentifizierung erforderlich." });
		}
		
		// Filter profiles to only those the user owns or has caregiver access to
		const accessibleProfiles = registry.profiles.filter(profile => 
			isProfileAuthorized(req, profile.id, db, registry)
		);
		
		res.json({ profiles: accessibleProfiles });
	});

	app.post("/api/v1/profiles", authMiddleware, async (req, res) => {
		const parsed = ProfileCreateSchema.safeParse(req.body);
		if (!parsed.success) {
			return res
				.status(400)
				.json({ error: "Profilinformationen fehlen oder sind ungültig." });
		}

		// Ensure user is authenticated
		if (!req.user?.id) {
			return res.status(401).json({ error: "Authentifizierung erforderlich." });
		}

		try {
			const profile = ensureProfileRecord(registry, {
				id: parsed.data.id,
				displayName: parsed.data.displayName,
				metadata: parsed.data.metadata,
			});

			const existingDbProfile = db.profiles.find((p) => p.id === profile.id);
			if (!existingDbProfile) {
				db.profiles.push({
					id: profile.id,
					userId: req.user.id, // Set owner to authenticated user
					displayName: profile.displayName,
					createdAt: profile.createdAt,
					metadata: profile.metadata,
					consentDataUpload: false,
					consentHelpMeGetSmarter: false,
					vocabularySetId: "basic",
				});
			} else {
				// Profile already exists - check if user owns it or if it's a legacy profile
				if (existingDbProfile.userId && existingDbProfile.userId !== req.user.id) {
					// Profile belongs to another user - cannot take over
					return res.status(403).json({ 
						error: "Profil existiert bereits und gehört einem anderen Benutzer." 
					});
				}
				// Either:
				// 1. Profile has no userId (legacy/system profile) - update it
				// 2. Profile belongs to current user - idempotent creation is fine
				if (!existingDbProfile.userId || existingDbProfile.userId === "system") {
					existingDbProfile.userId = req.user.id;
				}
			}

			await withFileLock(registryPath, async () =>
				saveRegistry(registryPath, registry),
			);
			await withFileLock(dbFilePath, async () => saveDatabase(db, dbFilePath));

			return res.status(201).json({ profile });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logError("Profile creation failed", { error: message });
			return res
				.status(500)
				.json({ error: "Profil konnte nicht erstellt werden." });
		}
	});

	app.get("/api/v1/profiles/:id", authMiddleware, (req, res) => {
		// Check authorization before returning profile
		if (!isProfileAuthorized(req, req.params.id, db, registry)) {
			return res.status(403).json({ error: "Zugriff verweigert." });
		}
		
		const record = findProfileRecord(registry, req.params.id);
		if (!record) {
			return res.status(404).json({ error: "Profil nicht gefunden." });
		}
		return res.json(record);
	});

	app.patch("/api/v1/profiles/:id", authMiddleware, async (req, res) => {
		// Check authorization before allowing update
		if (!isProfileAuthorized(req, req.params.id, db, registry)) {
			return res.status(403).json({ error: "Zugriff verweigert." });
		}
		
		const parsed = ProfileUpdateSchema.safeParse(req.body);
		if (!parsed.success) {
			return res
				.status(400)
				.json({ error: "Profilinformationen fehlen oder sind ungültig." });
		}
		try {
			const record = updateProfileRecord(registry, req.params.id, parsed.data);
			if (!record) {
				return res.status(404).json({ error: "Profil nicht gefunden." });
			}
			const dbProfile = db.profiles.find((p) => p.id === record.id);
			if (dbProfile) {
				dbProfile.displayName = record.displayName;
				dbProfile.metadata = record.metadata;
			}
			await withFileLock(registryPath, async () =>
				saveRegistry(registryPath, registry),
			);
			await withFileLock(dbFilePath, async () => saveDatabase(db, dbFilePath));
			return res.json(record);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logError("Profile update failed", { error: message });
			return res
				.status(500)
				.json({ error: "Profil konnte nicht aktualisiert werden." });
		}
	});

	app.post("/api/v1/profiles/:id/merge", authMiddleware, async (req, res) => {
		// Check authorization for target profile
		if (!isProfileAuthorized(req, req.params.id, db, registry)) {
			return res.status(403).json({ error: "Zugriff verweigert." });
		}
		
		const parsed = MergeSchema.safeParse(req.body);
		if (!parsed.success) {
			return res
				.status(400)
				.json({ error: "Zusammenführung benötigt eine gültige Quell-ID." });
		}
		
		// Check authorization for source profile
		if (!isProfileAuthorized(req, parsed.data.sourceProfileId, db, registry)) {
			return res.status(403).json({ error: "Zugriff auf Quellprofil verweigert." });
		}
		
		const target = findProfileRecord(registry, req.params.id);
		const source = findProfileRecord(registry, parsed.data.sourceProfileId);
		if (!target || !source) {
			return res.status(404).json({ error: "Profil nicht gefunden." });
		}
		if (target.id === source.id) {
			return res
				.status(400)
				.json({
					error: "Quellprofil und Zielprofil dürfen nicht identisch sein.",
				});
		}
		const mode = parsed.data.mode ?? "merge";

		try {
			await mergeProfileData(db, source.id, target.id);

			if (mode === "merge") {
				db.profiles = db.profiles.filter((p) => p.id !== source.id);
				registry.profiles = registry.profiles.filter((p) => p.id !== source.id);
			} else {
				const sourceRecord = registry.profiles.find((p) => p.id === source.id);
				if (sourceRecord) {
					sourceRecord.metadata = {
						...sourceRecord.metadata,
						notes: `Daten übertragen nach ${target.displayName} (${target.id}).`,
					};
					sourceRecord.updatedAt = new Date().toISOString();
				}
			}

			await withFileLock(dbFilePath, async () => saveDatabase(db, dbFilePath));
			await withFileLock(registryPath, async () =>
				saveRegistry(registryPath, registry),
			);
			return res.json({ status: "merged", targetProfileId: target.id });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logError("Profile merge failed", { error: message });
			return res
				.status(500)
				.json({ error: "Profile konnten nicht zusammengeführt werden." });
		}
	});

	app.post("/api/v1/profiles/:id/share", authMiddleware, (req, res) => {
		// Check authorization before allowing share
		if (!isProfileAuthorized(req, req.params.id, db, registry)) {
			return res.status(403).json({ error: "Zugriff verweigert." });
		}
		
		const parsed = ShareSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({ error: "Freigabedaten fehlen." });
		}
		const profile = findProfileRecord(registry, req.params.id);
		if (!profile) {
			return res.status(404).json({ error: "Profil nicht gefunden." });
		}
		const token = createShareToken(registry, profile.id, {
			permissions: parsed.data.permissions,
			createdBy: req.user?.id,
		});
		return res.json({
			token: token.token,
			expiresAt: token.expiresAt,
			permissions: token.permissions,
		});
	});

	app.post(
		"/api/v1/profiles/share/accept",
		authMiddleware,
		async (req, res) => {
			const parsed = AcceptShareSchema.safeParse(req.body);
			if (!parsed.success) {
				return res.status(400).json({ error: "Freigabe-Token fehlt." });
			}
			const token = redeemShareToken(
				registry,
				parsed.data.token,
				req.user?.id ?? "unknown",
			);
			if (!token) {
				return res
					.status(404)
					.json({ error: "Freigabe-Token ungültig oder abgelaufen." });
			}
			const profile = attachCaregiver(registry, token.profileId, {
				caregiverId: req.user?.id ?? "unknown",
				role: token.permissions === "write" ? "caregiver" : "viewer",
			});
			if (!profile) {
				return res.status(404).json({ error: "Profil nicht gefunden." });
			}
			await withFileLock(registryPath, async () =>
				saveRegistry(registryPath, registry),
			);
			return res.json({ status: "accepted", profileId: profile.id });
		},
	);

	app.post("/api/v1/profiles/:id/sync-token", authMiddleware, (req, res) => {
		// Check authorization before creating sync token
		if (!isProfileAuthorized(req, req.params.id, db, registry)) {
			return res.status(403).json({ error: "Zugriff verweigert." });
		}
		
		const parsed = SyncTokenSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({ error: "Synchronisierungsdaten fehlen." });
		}
		const profile = findProfileRecord(registry, req.params.id);
		if (!profile) {
			return res.status(404).json({ error: "Profil nicht gefunden." });
		}
		const token = createSyncToken(registry, profile.id, {
			deviceId: parsed.data.deviceId,
		});
		if (parsed.data.deviceId) {
			registerDevice(registry, profile.id, {
				deviceId: parsed.data.deviceId,
				name: parsed.data.deviceName,
			});
		}
		return res.json({ token: token.token, expiresAt: token.expiresAt });
	});

	app.post("/api/v1/profiles/sync", authMiddleware, async (req, res) => {
		const parsed = SyncRedeemSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({ error: "Synchronisierungs-Token fehlt." });
		}
		const token = redeemSyncToken(
			registry,
			parsed.data.token,
			parsed.data.deviceId,
		);
		if (!token) {
			return res
				.status(404)
				.json({ error: "Synchronisierungs-Token ungültig oder abgelaufen." });
		}
		const profile = findProfileRecord(registry, token.profileId);
		if (!profile) {
			return res.status(404).json({ error: "Profil nicht gefunden." });
		}
		if (parsed.data.deviceId) {
			registerDevice(registry, profile.id, {
				deviceId: parsed.data.deviceId,
				name: parsed.data.deviceName,
			});
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
				`attachment; filename="profile_${profile.id}_sync.zip"`,
			);
			res.setHeader("X-Profile-Checksum", checksum);
			return res.status(200).send(buffer);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logError("Profile sync export failed", { error: message });
			return res
				.status(500)
				.json({ error: "Synchronisierung fehlgeschlagen." });
		}
	});

	app.post("/api/v1/profiles/:id/sync", authMiddleware, async (req, res) => {
		// Check authorization before restoring sync
		if (!isProfileAuthorized(req, req.params.id, db, registry)) {
			return res.status(403).json({ error: "Zugriff verweigert." });
		}
		
		const parsed = SyncRestoreSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({ error: "Synchronisierungs-Paket fehlt." });
		}
		const profile = findProfileRecord(registry, req.params.id);
		if (!profile) {
			return res.status(404).json({ error: "Profil nicht gefunden." });
		}
		try {
			const buffer = Buffer.from(parsed.data.archiveBase64, "base64");
			await restoreProfileFromArchive(profile.id, buffer, db);
			await withFileLock(dbFilePath, async () => saveDatabase(db, dbFilePath));
			return res.json({ status: "synced", profileId: profile.id });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logError("Profile sync restore failed", { error: message });
			return res
				.status(500)
				.json({ error: "Synchronisierung konnte nicht eingespielt werden." });
		}
	});

	app.post("/api/v1/profiles/:id/backup", authMiddleware, async (req, res) => {
		// Check authorization before allowing backup
		if (!isProfileAuthorized(req, req.params.id, db, registry)) {
			return res.status(403).json({ error: "Zugriff verweigert." });
		}
		
		const profile = findProfileRecord(registry, req.params.id);
		if (!profile) {
			return res.status(404).json({ error: "Profil nicht gefunden." });
		}
		try {
			const backup = await writeProfileBackup(profile.id, registry, db);
			registry.backups.push({
				profileId: profile.id,
				createdAt: new Date().toISOString(),
				path: backup.path,
				sizeBytes: backup.sizeBytes,
				checksum: backup.checksum,
			});
			await withFileLock(registryPath, async () =>
				saveRegistry(registryPath, registry),
			);
			return res.json({ status: "backup_created", backup });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logError("Profile backup failed", { error: message });
			return res
				.status(500)
				.json({ error: "Backup konnte nicht erstellt werden." });
		}
	});

	app.get("/api/v1/profiles/:id/backups", authMiddleware, async (req, res) => {
		// Check authorization before showing backups
		if (!isProfileAuthorized(req, req.params.id, db, registry)) {
			return res.status(403).json({ error: "Zugriff verweigert." });
		}
		
		const profile = findProfileRecord(registry, req.params.id);
		if (!profile) {
			return res.status(404).json({ error: "Profil nicht gefunden." });
		}
		const backups = await listProfileBackups(profile.id);
		return res.json({ backups });
	});

	app.post(
		"/api/v1/profiles/:id/restore",
		authMiddleware,
		backupRestoreRateLimiter,
		async (req, res) => {
			// Check authorization before restoring backup
			if (!isProfileAuthorized(req, req.params.id, db, registry)) {
				return res.status(403).json({ error: "Zugriff verweigert." });
			}
			
			const parsed = BackupRestoreSchema.safeParse(req.body);
			if (!parsed.success) {
				return res.status(400).json({ error: "Backup-Pfad fehlt." });
			}
			const profile = findProfileRecord(registry, req.params.id);
			if (!profile) {
				return res.status(404).json({ error: "Profil nicht gefunden." });
			}
			try {
				const backupDir = path.resolve(PROFILE_BACKUPS_DIR, profile.id);
				const safeBackupPath = path.resolve(
					backupDir,
					path.basename(parsed.data.backupPath),
				);

				if (!safeBackupPath.startsWith(backupDir)) {
					logError("Path traversal attempt detected in profile restore", {
						profileId: profile.id,
						requestedPath: parsed.data.backupPath,
					});
					return res.status(400).json({ error: "Ungültiger Backup-Pfad." });
				}

				const buffer = await fs.readFile(safeBackupPath);
				await restoreProfileFromArchive(profile.id, buffer, db);
				await withFileLock(dbFilePath, async () =>
					saveDatabase(db, dbFilePath),
				);
				return res.json({ status: "restored", profileId: profile.id });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logError("Profile restore failed", { error: message });
				return res
					.status(500)
					.json({ error: "Backup konnte nicht wiederhergestellt werden." });
			}
		},
	);

	app.delete("/api/v1/profiles/:id/data", authMiddleware, async (req, res) => {
		// Check authorization before allowing data deletion
		if (!isProfileAuthorized(req, req.params.id, db, registry)) {
			return res.status(403).json({ error: "Zugriff verweigert." });
		}
		
		const profile = findProfileRecord(registry, req.params.id);
		if (!profile) {
			return res.status(404).json({ error: "Profil nicht gefunden." });
		}
		try {
			await deleteProfileTrainingData(profile.id);
			return res.json({ status: "cleared", profileId: profile.id });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logError("Profile data cleanup failed", { error: message });
			return res
				.status(500)
				.json({ error: "Profil-Daten konnten nicht gelöscht werden." });
		}
	});
}
