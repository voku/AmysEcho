/**
 * User Label Settings Routes
 *
 * Amy First: API endpoints for managing per-user, per-label training settings.
 * Each child can configure their own label collection with different training modes.
 *
 * Endpoints:
 * - GET /api/v1/users/:userId/labels - List all labels with settings and readiness
 * - GET /api/v1/users/:userId/labels/:labelId - Get specific label details
 * - PATCH /api/v1/users/:userId/labels/:labelId - Update label mode/enabled
 * - POST /api/v1/users/:userId/labels/initialize - Initialize default settings
 */

import type { Express, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { Database } from "../db.js";
import type { ProfileRegistry } from "../services/profileRegistry.js";
import {
	getLabelReadiness,
	getLabelReadinessForUser,
	getLabelSetting,
	getUserLabelSettings,
	initializeUserLabelSettings,
	setLabelSetting,
} from "../services/userLabelSettingsService.js";
import { loadBaselineLabels } from "../services/labelRegistry.js";
import { isProfileAuthorized } from "../utils/profileAuthorization.js";
import { PROFILE_ID_PATTERN } from "../constants/modelPaths.js";

// Label ID pattern for validation
const LABEL_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

// Validation schemas
const UpdateLabelSettingSchema = z.object({
	mode: z.enum(["server_pretrain", "user_train"]).optional(),
	enabled: z.boolean().optional(),
});

interface UserLabelRouteDeps {
	authMiddleware: (req: Request, res: Response, next: NextFunction) => void;
	db: Database;
	registry: ProfileRegistry;
	logError: (message: string, metadata?: Record<string, unknown>) => void;
}

// Rate limiter for label settings endpoints
const labelSettingsLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // limit each IP to 100 requests per windowMs
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Zu viele Anfragen. Bitte später erneut versuchen." },
});

export function registerUserLabelRoutes(
	app: Express,
	deps: UserLabelRouteDeps,
): void {
	const { authMiddleware, db, registry, logError } = deps;

	/**
	 * GET /api/v1/users/:userId/labels
	 *
	 * List all labels with their settings and readiness status for a user.
	 * Returns combined data: setting (mode, enabled) + readiness (counts, reasons)
	 */
	app.get(
		"/api/v1/users/:userId/labels",
		labelSettingsLimiter,
		authMiddleware,
		async (req: Request, res: Response) => {
			const { userId } = req.params;

			// Validate userId format
			if (!userId || !PROFILE_ID_PATTERN.test(userId)) {
				return res.status(400).json({ error: "Ungültige Benutzer-ID." });
			}

			// Check authorization
			if (!isProfileAuthorized(req, userId, db, registry)) {
				return res.status(403).json({ error: "Zugriff verweigert." });
			}

			try {
				const readinessStatuses = await getLabelReadinessForUser(userId);
				const settings = getUserLabelSettings(userId);

				// Use Map for O(1) lookups instead of O(N) find in loop
				const settingsMap = new Map(settings.map(s => [s.labelId, s]));

				// Merge settings with readiness
				const labels = readinessStatuses.map((status) => {
					const setting = settingsMap.get(status.labelId);
					return {
						...status,
						updatedAt: setting?.updatedAt,
					};
				});

				// Calculate stats
				const stats = {
					totalLabels: labels.length,
					enabledLabels: labels.filter((l) => l.enabled).length,
					serverPretrainLabels: labels.filter(
						(l) => l.mode === "server_pretrain",
					).length,
					userTrainLabels: labels.filter((l) => l.mode === "user_train")
						.length,
					readyLabels: labels.filter((l) => l.ready).length,
				};

				return res.json({ labels, stats });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logError("Failed to get user labels", { userId, error: message });
				return res.status(500).json({
					error: "Label-Einstellungen konnten nicht geladen werden.",
				});
			}
		},
	);

	/**
	 * GET /api/v1/users/:userId/labels/:labelId
	 *
	 * Get detailed settings and readiness for a specific label.
	 */
	app.get(
		"/api/v1/users/:userId/labels/:labelId",
		labelSettingsLimiter,
		authMiddleware,
		async (req: Request, res: Response) => {
			const { userId, labelId } = req.params;

			// Validate userId format
			if (!userId || !PROFILE_ID_PATTERN.test(userId)) {
				return res.status(400).json({ error: "Ungültige Benutzer-ID." });
			}

			// Validate labelId format
			if (!labelId || !LABEL_ID_PATTERN.test(labelId)) {
				return res.status(400).json({ error: "Ungültige Label-ID." });
			}

			// Check authorization
			if (!isProfileAuthorized(req, userId, db, registry)) {
				return res.status(403).json({ error: "Zugriff verweigert." });
			}

			try {
				// Normalize labelId to lowercase for consistency
				const normalizedLabelId = labelId.toLowerCase();
				
				const readiness = await getLabelReadiness(userId, normalizedLabelId);
				if (!readiness) {
					return res.status(404).json({ error: "Label nicht gefunden." });
				}

				const setting = getLabelSetting(userId, normalizedLabelId);

				return res.json({
					...readiness,
					updatedAt: setting?.updatedAt,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logError("Failed to get label setting", {
					userId,
					labelId,
					error: message,
				});
				return res.status(500).json({
					error: "Label-Einstellungen konnten nicht geladen werden.",
				});
			}
		},
	);

	/**
	 * PATCH /api/v1/users/:userId/labels/:labelId
	 *
	 * Update mode and/or enabled status for a specific label.
	 */
	app.patch(
		"/api/v1/users/:userId/labels/:labelId",
		labelSettingsLimiter,
		authMiddleware,
		async (req: Request, res: Response) => {
			const { userId, labelId } = req.params;

			// Validate userId format
			if (!userId || !PROFILE_ID_PATTERN.test(userId)) {
				return res.status(400).json({ error: "Ungültige Benutzer-ID." });
			}

			// Validate labelId format
			if (!labelId || !LABEL_ID_PATTERN.test(labelId)) {
				return res.status(400).json({ error: "Ungültige Label-ID." });
			}

			// Check authorization
			if (!isProfileAuthorized(req, userId, db, registry)) {
				return res.status(403).json({ error: "Zugriff verweigert." });
			}

			// Validate request body
			const parsed = UpdateLabelSettingSchema.safeParse(req.body);
			if (!parsed.success) {
				return res.status(400).json({
					error: "Ungültige Daten.",
					details: parsed.error.issues,
				});
			}

			// Require at least one field to update
			if (
				parsed.data.mode === undefined &&
				parsed.data.enabled === undefined
			) {
				return res.status(400).json({
					error: "Mindestens 'mode' oder 'enabled' muss angegeben werden.",
				});
			}

			try {
				// Normalize labelId to lowercase for consistency
				const normalizedLabelId = labelId.toLowerCase();
				
				// Verify labelId exists in baseline labels before updating
				const baselineLabels = await loadBaselineLabels();
				if (!baselineLabels.includes(normalizedLabelId)) {
					return res.status(404).json({ error: "Label nicht gefunden." });
				}

				// Get existing setting or use defaults
				const existing = getLabelSetting(userId, normalizedLabelId);
				const mode = parsed.data.mode ?? existing?.mode ?? "user_train";
				const enabled = parsed.data.enabled ?? existing?.enabled ?? true;

				const setting = setLabelSetting(userId, normalizedLabelId, mode, enabled);

				// Return updated readiness as well
				const readiness = await getLabelReadiness(userId, normalizedLabelId);

				return res.json({
					...readiness,
					updatedAt: setting.updatedAt,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logError("Failed to update label setting", {
					userId,
					labelId,
					error: message,
				});
				return res.status(500).json({
					error: "Label-Einstellungen konnten nicht aktualisiert werden.",
				});
			}
		},
	);

	/**
	 * POST /api/v1/users/:userId/labels/initialize
	 *
	 * Initialize default label settings for a user.
	 * This copies baseline labels with user_train mode by default.
	 */
	app.post(
		"/api/v1/users/:userId/labels/initialize",
		labelSettingsLimiter,
		authMiddleware,
		async (req: Request, res: Response) => {
			const { userId } = req.params;

			// Validate userId format
			if (!userId || !PROFILE_ID_PATTERN.test(userId)) {
				return res.status(400).json({ error: "Ungültige Benutzer-ID." });
			}

			// Check authorization
			if (!isProfileAuthorized(req, userId, db, registry)) {
				return res.status(403).json({ error: "Zugriff verweigert." });
			}

			try {
				await initializeUserLabelSettings(userId);
				const labels = await getLabelReadinessForUser(userId);

				return res.json({
					status: "initialized",
					labelCount: labels.length,
					labels,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logError("Failed to initialize label settings", {
					userId,
					error: message,
				});
				return res.status(500).json({
					error:
						"Label-Einstellungen konnten nicht initialisiert werden.",
				});
			}
		},
	);
}
