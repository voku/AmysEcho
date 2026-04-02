/**
 * ProfileLabelSettingsService - Manages per-profile, per-label training settings
 *
 * Amy First: Each child can have their own personalized label collection with
 * different training modes (server_pretrain vs user_train) per label.
 *
 * This service provides:
 * - CRUD for profile label settings
 * - Readiness computation per label
 * - Training source validation
 */

import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import {
	PROFILE_ID_PATTERN,
	TRAINING_UPLOADS_DIR,
	getUserLabelTrainingPath,
	getUserLabelLandmarksPath,
	ensureUserLabelDirs,
} from "../constants/modelPaths.js";
import {
	getEnabledProfileLabelsByMode,
	getProfileLabelSetting,
	getProfileLabelSettingsByProfileId,
	insertProfileLabelSetting,
	updateProfileLabelLastTrained,
	upsertProfileLabelSetting,
} from "../sqliteDb.js";
import type {
	LabelReadinessStatus,
	LabelTrainingMode,
	UserLabelSetting,
} from "../types.js";
import { loadBaselineLabels, loadDgsManifest } from "./labelRegistry.js";

// Minimum videos required for server_pretrain mode
const MIN_VIDEOS_FOR_SERVER_PRETRAIN = 3;
// Minimum samples required for user_train mode
const MIN_SAMPLES_FOR_USER_TRAIN = 5;

/**
 * Get all label settings for a profile
 * @param profileId The profile ID
 * @returns Array of user label settings
 */
export function getProfileLabelSettings(profileId: string): UserLabelSetting[] {
	if (!PROFILE_ID_PATTERN.test(profileId)) {
		throw new Error("Ungültige Profil-ID.");
	}
	return getProfileLabelSettingsByProfileId(profileId);
}

/**
 * Get a specific label setting for a profile
 * @param profileId The profile ID
 * @param labelId The label ID
 * @returns The user label setting or undefined
 */
export function getLabelSetting(
	profileId: string,
	labelId: string,
): UserLabelSetting | undefined {
	if (!PROFILE_ID_PATTERN.test(profileId)) {
		throw new Error("Ungültige Profil-ID.");
	}
	return getProfileLabelSetting(profileId, labelId);
}

/**
 * Create or update a label setting for a profile
 * @param profileId The profile ID
 * @param labelId The label ID
 * @param mode Training mode (server_pretrain or user_train)
 * @param enabled Whether training is enabled for this label
 * @returns The created/updated setting
 */
export function setLabelSetting(
	profileId: string,
	labelId: string,
	mode: LabelTrainingMode,
	enabled: boolean,
): UserLabelSetting {
	if (!PROFILE_ID_PATTERN.test(profileId)) {
		throw new Error("Ungültige Profil-ID.");
	}
	if (!labelId || !/^[a-zA-Z0-9_-]+$/.test(labelId)) {
		throw new Error("Ungültige Label-ID.");
	}
	if (mode !== "server_pretrain" && mode !== "user_train") {
		throw new Error("Ungültiger Trainingsmodus.");
	}

	const existing = getProfileLabelSetting(profileId, labelId);
	const now = new Date().toISOString();

	const setting: UserLabelSetting = {
		id: existing?.id ?? randomUUID(),
		profileId,
		labelId,
		mode,
		enabled,
		updatedAt: now,
		lastTrainedAt: existing?.lastTrainedAt,
	};

	upsertProfileLabelSetting(setting);
	return setting;
}

/**
 * Update the lastTrainedAt timestamp for a label
 */
export function markLabelTrained(
	profileId: string,
	labelId: string,
	trainedAt?: string,
): void {
	const timestamp = trainedAt ?? new Date().toISOString();
	updateProfileLabelLastTrained(profileId, labelId, timestamp);
}

/**
 * Get enabled labels for a profile with a specific training mode
 */
export function getEnabledLabels(
	profileId: string,
	mode: LabelTrainingMode,
): UserLabelSetting[] {
	if (!PROFILE_ID_PATTERN.test(profileId)) {
		throw new Error("Ungültige Profil-ID.");
	}
	return getEnabledProfileLabelsByMode(profileId, mode);
}

/**
 * Validate and get a safe path for profile training directory
 * Prevents path traversal attacks by validating inputs and checking path containment
 */
function getSafeProfileTrainingDir(
	profileId: string,
	labelId: string,
): string | null {
	// Validate profileId against UUID pattern
	if (!PROFILE_ID_PATTERN.test(profileId)) {
		return null;
	}
	// Validate labelId to allow only safe characters and ensure non-empty
	if (!labelId || !/^[a-zA-Z0-9_-]+$/.test(labelId)) {
		return null;
	}

	// Resolve paths to prevent traversal
	const rootDir = path.resolve(TRAINING_UPLOADS_DIR);
	const userTrainDir = path.resolve(rootDir, profileId, labelId);

	// Ensure the resolved path is a proper subdirectory of the root directory
	// Must start with rootDir + separator to be a valid subdirectory
	const rootWithSep = rootDir.endsWith(path.sep) ? rootDir : rootDir + path.sep;
	if (!userTrainDir.startsWith(rootWithSep)) {
		return null;
	}

	return userTrainDir;
}

/**
 * Count profile training samples for a label
 */
export async function countProfileSamples(
	profileId: string,
	labelId: string,
): Promise<number> {
	const userTrainDir = getSafeProfileTrainingDir(profileId, labelId);
	if (!userTrainDir) {
		return 0;
	}

	try {
		const entries = await fs.readdir(userTrainDir);
		// Count directories (each upload bundle is a directory) using parallel stat
		const stats = await Promise.all(
			entries.map(async (entry) => {
				try {
					// Validate entry name to prevent path traversal
					// fs.readdir returns only entry names, but check for ".." to be safe
					if (entry.includes("..")) {
						return false;
					}
					const entryPath = path.join(userTrainDir, entry);
					const stat = await fs.stat(entryPath);
					return stat.isDirectory();
				} catch {
					return false;
				}
			})
		);
		return stats.filter(Boolean).length;
	} catch {
		return 0;
	}
}

/**
 * Count profile landmarks for a label
 */
export async function countProfileLandmarks(
	profileId: string,
	labelId: string,
): Promise<number> {
	const userTrainDir = getSafeProfileTrainingDir(profileId, labelId);
	if (!userTrainDir) {
		return 0;
	}

	try {
		const entries = await fs.readdir(userTrainDir, { recursive: true });
		return entries.filter(
			(e) =>
				typeof e === "string" &&
				!e.includes("..") && // Prevent path traversal in entry names
				(e.endsWith("landmarks.json") || e.endsWith("_landmarks.json")),
		).length;
	} catch {
		return 0;
	}
}

/**
 * Count server-pretrain landmarks for a label
 * These are landmarks extracted from curated internet DGS videos
 */
export async function countServerLandmarks(
	profileId: string,
	labelId: string,
): Promise<number> {
	// Validate inputs
	if (!PROFILE_ID_PATTERN.test(profileId)) {
		return 0;
	}
	if (!labelId || !/^[a-zA-Z0-9_-]+$/.test(labelId)) {
		return 0;
	}

	try {
		const serverLandmarksPath = getUserLabelLandmarksPath(
			profileId,
			labelId,
			"server_pretrain",
		);
		const entries = await fs.readdir(serverLandmarksPath);
		return entries.filter(
			(e) =>
				typeof e === "string" &&
				!e.includes("..") &&
				e.endsWith(".json"),
		).length;
	} catch {
		return 0;
	}
}

/**
 * Get readiness status for all labels for a profile
 * Amy First: Transparent visibility into training readiness
 */
export async function getLabelReadinessForProfile(
	profileId: string,
): Promise<LabelReadinessStatus[]> {
	if (!PROFILE_ID_PATTERN.test(profileId)) {
		throw new Error("Ungültige Profil-ID.");
	}

	const baselineLabels = await loadBaselineLabels();
	const dgsManifest = await loadDgsManifest();
	const userSettings = getProfileLabelSettingsByProfileId(profileId);
	const labelIds = new Set<string>(baselineLabels);
	for (const setting of userSettings) {
		labelIds.add(setting.labelId);
	}
	const allLabels = Array.from(labelIds);

	// Build a map for quick lookup
	const settingsMap = new Map<string, UserLabelSetting>();
	for (const s of userSettings) {
		settingsMap.set(s.labelId, s);
	}

	// Process all labels in parallel for better performance
	const results = await Promise.all(allLabels.map(async (labelId) => {
		const setting = settingsMap.get(labelId);
		const mode: LabelTrainingMode = setting?.mode ?? "user_train";
		const enabled = setting?.enabled ?? false;

		// Get server video count from manifest
		const gesture = dgsManifest?.gestures?.find((g) => g.id === labelId);
		const serverVideoCount = gesture?.totalVideoCount ?? gesture?.videos?.length ?? 0;

		// Get user sample and landmark counts
		const profileSampleCount = await countProfileSamples(profileId, labelId);
		const profileLandmarkCount = await countProfileLandmarks(profileId, labelId);

		// Get server landmark count for server_pretrain mode
		const serverLandmarkCount = await countServerLandmarks(profileId, labelId);

		// Compute readiness
		const reasons: string[] = [];
		let ready = enabled;

		if (mode === "server_pretrain") {
			if (serverVideoCount < MIN_VIDEOS_FOR_SERVER_PRETRAIN) {
				reasons.push(
					`Zu wenige Server-Videos (${serverVideoCount}/${MIN_VIDEOS_FOR_SERVER_PRETRAIN})`,
				);
				ready = false;
			}
			// Check for server landmarks - required for training
			if (serverLandmarkCount === 0) {
				reasons.push("Keine Server-Landmarks vorhanden");
				ready = false;
			} else if (serverLandmarkCount < MIN_VIDEOS_FOR_SERVER_PRETRAIN) {
				reasons.push(
					`Zu wenige Server-Landmarks (${serverLandmarkCount}/${MIN_VIDEOS_FOR_SERVER_PRETRAIN})`,
				);
				ready = false;
			}
		} else {
			// user_train mode
			if (profileSampleCount < MIN_SAMPLES_FOR_USER_TRAIN) {
				reasons.push(
					`Zu wenige Benutzeraufnahmen (${profileSampleCount}/${MIN_SAMPLES_FOR_USER_TRAIN})`,
				);
				ready = false;
			}
			if (profileLandmarkCount < profileSampleCount) {
				reasons.push(
					`Landmarks fehlen (${profileLandmarkCount}/${profileSampleCount})`,
				);
				ready = false;
			}
		}

		if (!enabled) {
			reasons.push("Label ist deaktiviert");
			ready = false;
		}

		// Get display name from manifest or fallback
		const displayName = labelId.charAt(0).toUpperCase() + labelId.slice(1);

		return {
			labelId,
			displayName,
			mode,
			enabled,
			serverVideoCount,
			userSampleCount: profileSampleCount,
			landmarkCount: mode === "server_pretrain" ? serverLandmarkCount : profileLandmarkCount,
			ready,
			reasons,
			lastTrainedAt: setting?.lastTrainedAt,
		};
	}));

	return results;
}

/**
 * Get readiness status for a single label
 */
export async function getLabelReadiness(
	profileId: string,
	labelId: string,
): Promise<LabelReadinessStatus | undefined> {
	const allReadiness = await getLabelReadinessForProfile(profileId);
	return allReadiness.find((r) => r.labelId === labelId);
}

/**
 * Initialize default label settings for a new profile
 * Copies from baseline labels with user_train mode by default
 */
export async function initializeProfileLabelSettings(
	profileId: string,
): Promise<void> {
	if (!PROFILE_ID_PATTERN.test(profileId)) {
		throw new Error("Ungültige Profil-ID.");
	}

	const baselineLabels = await loadBaselineLabels();
	const now = new Date().toISOString();

	for (const labelId of baselineLabels) {
		const existing = getProfileLabelSetting(profileId, labelId);
		if (!existing) {
			const setting: UserLabelSetting = {
				id: randomUUID(),
				profileId,
				labelId,
				mode: "user_train", // Default to profile training
				enabled: true,
				updatedAt: now,
			};
			insertProfileLabelSetting(setting);
		}
	}
}

/**
 * Get the training data directory for a profile and label based on mode
 * Re-exports from modelPaths for convenience
 */
export function getTrainingDataPath(
	profileId: string,
	labelId: string,
	mode: LabelTrainingMode,
): string {
	return getUserLabelTrainingPath(profileId, labelId, mode);
}

/**
 * Ensure training directories exist for a profile and label
 * Re-exports from modelPaths for convenience
 */
export async function ensureTrainingDirectories(
	profileId: string,
	labelId: string,
): Promise<void> {
	await ensureUserLabelDirs(profileId, labelId);
}
