import { existsSync, promises as fs } from "fs";
import path from "path";

const explicitDataDir = process.env.AMY_ECHO_DATA_DIR;

function resolveServerDir(): string {
	const candidates: (string | undefined)[] = [];

	if (typeof __dirname !== "undefined") {
		candidates.push(path.resolve(__dirname, "..", ".."));
	}

	if (typeof process !== "undefined") {
		const cwd = typeof process.cwd === "function" ? process.cwd() : undefined;
		if (cwd) {
			candidates.push(path.resolve(cwd));
			candidates.push(path.resolve(cwd, "server"));
		}

		if (Array.isArray(process.argv)) {
			const scriptPath = process.argv[1];
			if (scriptPath) {
				candidates.push(path.resolve(path.dirname(scriptPath), ".."));
			}
		}
	}

	for (const candidate of candidates) {
		if (!candidate) continue;
		if (existsSync(path.join(candidate, "package.json"))) {
			return candidate;
		}
	}

	// Fall back to cwd so tests still have a deterministic location.
	return candidates.find(Boolean) ?? path.resolve(".");
}

export const SERVER_DIR = resolveServerDir();
export const SRC_DIR = path.join(SERVER_DIR, "src");
export const DATA_DIR = explicitDataDir
	? path.resolve(explicitDataDir)
	: path.join(SERVER_DIR, "data");

export const PROFILE_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function getProfiledPath(basePath: string, profileId?: string): string {
	if (profileId) {
		if (!PROFILE_ID_PATTERN.test(profileId)) {
			throw new Error("Invalid profileId");
		}
		const ext = path.extname(basePath);
		const base = path.basename(basePath, ext);
		return path.join(DATA_DIR, `${base}_${profileId}${ext}`);
	}
	return basePath;
}

// MLP model path (.npz)
export const MLP_MODELS_DIR = path.join(DATA_DIR, "models");
export const TRAINED_MLP_GLOBAL_DIR = path.join(MLP_MODELS_DIR, "global");
export const TRAINED_MLP_MODEL_PATH = path.join(
	TRAINED_MLP_GLOBAL_DIR,
	"amy_model.npz",
);
export function getMlpModelPath(profileId?: string): string {
	if (!profileId) {
		return TRAINED_MLP_MODEL_PATH;
	}
	if (!PROFILE_ID_PATTERN.test(profileId)) {
		throw new Error("Invalid profileId");
	}
	return path.join(MLP_MODELS_DIR, profileId, "amy_model.npz");
}
// The global model is the demo/baseline bundle. Keep this alias while older
// call sites are migrated away from the former DATA_DIR/amy_model.npz seed.
export const BASELINE_MLP_MODEL_PATH = TRAINED_MLP_MODEL_PATH;

export const TRAINING_UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export const TRAINING_DATASETS_DIR = path.join(DATA_DIR, "datasets");

// Per-user training data directory structure
// data/users/{userId}/labels/{labelId}/{mode}/[videos|landmarks]/
export const USER_TRAINING_DATA_DIR = path.join(DATA_DIR, "users");

// Per-profile Metacom board bundles
// data/metacom/{profileId}/metacom_bundle.json
export const METACOM_BUNDLES_DIR = path.join(DATA_DIR, "metacom");

/**
 * Get the filesystem path for a profile's Metacom bundle.
 */
export function getProfileMetacomBundlePath(profileId: string): string {
	if (!PROFILE_ID_PATTERN.test(profileId)) {
		throw new Error("Ungültige Profil-ID");
	}
	return path.join(METACOM_BUNDLES_DIR, profileId, "metacom_bundle.json");
}

export type TrainingMode = "server_pretrain" | "user_train";

/**
 * Get the training data directory for a specific user
 */
export function getUserTrainingDir(userId: string): string {
	if (!PROFILE_ID_PATTERN.test(userId)) {
		throw new Error("Ungültige Benutzer-ID");
	}
	return path.join(USER_TRAINING_DATA_DIR, userId);
}

/**
 * Get the training data path for a user, label, and training mode
 * Returns: data/users/{userId}/labels/{labelId}/{mode}/
 */
export function getUserLabelTrainingPath(
	userId: string,
	labelId: string,
	mode: TrainingMode,
): string {
	// Reuse getUserTrainingDir which already validates userId
	const userTrainingDir = getUserTrainingDir(userId);
	if (!labelId || !/^[a-zA-Z0-9_-]+$/.test(labelId)) {
		throw new Error("Ungültige Label-ID");
	}
	return path.join(userTrainingDir, "labels", labelId, mode);
}

/**
 * Get the videos directory for a user, label, and training mode
 */
export function getUserLabelVideosPath(
	userId: string,
	labelId: string,
	mode: TrainingMode,
): string {
	return path.join(getUserLabelTrainingPath(userId, labelId, mode), "videos");
}

/**
 * Get the landmarks directory for a user, label, and training mode
 */
export function getUserLabelLandmarksPath(
	userId: string,
	labelId: string,
	mode: TrainingMode,
): string {
	return path.join(getUserLabelTrainingPath(userId, labelId, mode), "landmarks");
}

/**
 * Get the training report path for a user
 */
export function getUserTrainingReportPath(userId: string, timestamp: string): string {
	if (!PROFILE_ID_PATTERN.test(userId)) {
		throw new Error("Ungültige Benutzer-ID");
	}
	return path.join(USER_TRAINING_DATA_DIR, userId, "models", `report_${timestamp}.json`);
}

// Ensure DATA_DIR exists before any read/write
export async function ensureDataDir(): Promise<void> {
	await fs.mkdir(DATA_DIR, { recursive: true });
}

/**
 * Ensure user training directories exist for a label
 */
export async function ensureUserLabelDirs(
	userId: string,
	labelId: string,
): Promise<void> {
	await fs.mkdir(getUserLabelVideosPath(userId, labelId, "server_pretrain"), { recursive: true });
	await fs.mkdir(getUserLabelLandmarksPath(userId, labelId, "server_pretrain"), { recursive: true });
	await fs.mkdir(getUserLabelVideosPath(userId, labelId, "user_train"), { recursive: true });
	await fs.mkdir(getUserLabelLandmarksPath(userId, labelId, "user_train"), { recursive: true });
}
