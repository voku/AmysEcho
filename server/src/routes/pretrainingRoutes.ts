/**
 * Pre-training Routes
 *
 * Amy First: Provides endpoints for server-side pre-training status and configuration.
 * This enables the webapp to check pre-training availability and manage label preferences.
 */

import { Router, Request, Response, Express } from "express";
import { promises as fs } from "fs";
import path from "path";
import { SERVER_DIR } from "../constants/modelPaths.js";

// Paths to configuration files
const LABEL_METADATA_PATH = path.join(
	SERVER_DIR,
	"data",
	"config",
	"labelMetadata.json",
);

const DGS_MANIFEST_PATH = path.join(
	SERVER_DIR,
	"data",
	"dgs_manifest.json",
);

const DGS_VIDEO_DIR = path.join(
	SERVER_DIR,
	"data",
	"dgs_video_examples",
);

interface LabelPreTrainingStatus {
	id: string;
	displayName: string;
	emoji: string;
	category: string;
	serverPreTrainingEnabled: boolean;
	videoCount: number;
	hasLandmarks: boolean;
	readyForTraining: boolean;
}

interface PreTrainingStatusResponse {
	enabled: boolean;
	labels: LabelPreTrainingStatus[];
	stats: {
		totalLabels: number;
		labelsWithVideos: number;
		labelsWithLandmarks: number;
		labelsReady: number;
	};
}

/**
 * Create the pre-training router
 */
function createPretrainingRouter(): Router {
	const router = Router();

/**
 * GET /api/pretraining/status
 * 
 * Returns the pre-training status for all configured labels.
 * The webapp uses this to display which labels have server-side training available.
 */
router.get("/status", async (_req: Request, res: Response) => {
	try {
		// Load label metadata
		let labelMetadata: {
			preTrainingConfig?: { enabled?: boolean };
			labels?: Record<string, {
				displayName: string;
				emoji: string;
				category: string;
				serverPreTrainingEnabled?: boolean;
			}>;
		} = { labels: {} };
		
		try {
			const content = await fs.readFile(LABEL_METADATA_PATH, "utf8");
			labelMetadata = JSON.parse(content);
		} catch {
			// Use empty defaults if file doesn't exist
		}

		// Load DGS manifest for video counts
		let dgsManifest: {
			gestures?: Array<{
				id: string;
				videos?: string[];
				totalVideoCount?: number;
			}>;
		} = { gestures: [] };
		
		try {
			const content = await fs.readFile(DGS_MANIFEST_PATH, "utf8");
			dgsManifest = JSON.parse(content);
		} catch {
			// Use empty defaults if file doesn't exist
		}

		// Check for landmark files
		const landmarkLabels = new Set<string>();
		try {
			const files = await fs.readdir(DGS_VIDEO_DIR);
			const landmarkFiles = files.filter(f => f.endsWith("_landmarks.json"));
			for (const file of landmarkFiles) {
				// Extract label from filename (first part before underscore)
				const label = file.split("_")[0];
				landmarkLabels.add(label);
			}
		} catch {
			// Directory doesn't exist
		}

		// Build label status list
		const labels: LabelPreTrainingStatus[] = [];
		const labelsConfig = labelMetadata.labels ?? {};

		for (const [id, config] of Object.entries(labelsConfig)) {
			const gesture = dgsManifest.gestures?.find(g => g.id === id);
			const videoCount = gesture?.totalVideoCount ?? gesture?.videos?.length ?? 0;
			const hasLandmarks = landmarkLabels.has(id);
			const serverPreTrainingEnabled = config.serverPreTrainingEnabled ?? false;

			labels.push({
				id,
				displayName: config.displayName,
				emoji: config.emoji,
				category: config.category,
				serverPreTrainingEnabled,
				videoCount,
				hasLandmarks,
				readyForTraining: serverPreTrainingEnabled && videoCount > 0 && hasLandmarks,
			});
		}

		// Calculate stats
		const stats = {
			totalLabels: labels.length,
			labelsWithVideos: labels.filter(l => l.videoCount > 0).length,
			labelsWithLandmarks: labels.filter(l => l.hasLandmarks).length,
			labelsReady: labels.filter(l => l.readyForTraining).length,
		};

		const response: PreTrainingStatusResponse = {
			enabled: labelMetadata.preTrainingConfig?.enabled ?? false,
			labels,
			stats,
		};

		res.json(response);
	} catch (error) {
		console.error("Error getting pre-training status:", error);
		res.status(500).json({ error: "Failed to get pre-training status" });
	}
});

/**
 * GET /api/pretraining/labels/:labelId
 * 
 * Returns detailed pre-training status for a specific label.
 */
router.get("/labels/:labelId", async (req: Request, res: Response) => {
	const { labelId } = req.params;

	// Validate labelId to prevent injection attacks
	// Only allow alphanumeric characters, underscores, and hyphens
	if (!labelId || !/^[a-zA-Z0-9_-]+$/.test(labelId)) {
		return res.status(400).json({ error: "Invalid label ID format" });
	}

	try {
		// Load label metadata
		let labelConfig: {
			displayName?: string;
			emoji?: string;
			category?: string;
			serverPreTrainingEnabled?: boolean;
		} | undefined;

		try {
			const content = await fs.readFile(LABEL_METADATA_PATH, "utf8");
			const metadata = JSON.parse(content);
			labelConfig = metadata.labels?.[labelId];
		} catch {
			// File doesn't exist
		}

		if (!labelConfig) {
			return res.status(404).json({ error: "Label not found" });
		}

		// Get video info from manifest
		let gesture: {
			videos?: string[];
			totalVideoCount?: number;
		} | undefined;

		try {
			const content = await fs.readFile(DGS_MANIFEST_PATH, "utf8");
			const manifest = JSON.parse(content);
			gesture = manifest.gestures?.find((g: { id: string }) => g.id === labelId);
		} catch {
			// File doesn't exist
		}

		// Check for landmark files
		let landmarkFiles: string[] = [];
		try {
			const files = await fs.readdir(DGS_VIDEO_DIR);
			// Escape special regex characters in labelId to prevent ReDoS
			const escapedLabelId = labelId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const labelPattern = new RegExp(`^${escapedLabelId}[_.].*_landmarks\\.json$`);
			landmarkFiles = files.filter(f => labelPattern.test(f));
		} catch {
			// Directory doesn't exist
		}

		const videoCount = gesture?.totalVideoCount ?? gesture?.videos?.length ?? 0;
		const hasLandmarks = landmarkFiles.length > 0;
		const serverPreTrainingEnabled = labelConfig.serverPreTrainingEnabled ?? false;

		return res.json({
			id: labelId,
			displayName: labelConfig.displayName,
			emoji: labelConfig.emoji,
			category: labelConfig.category,
			serverPreTrainingEnabled,
			videoCount,
			videos: gesture?.videos ?? [],
			landmarkFiles,
			hasLandmarks,
			readyForTraining: serverPreTrainingEnabled && videoCount > 0 && hasLandmarks,
		});
	} catch (error) {
		console.error(`Error getting label status for ${labelId}:`, error);
		return res.status(500).json({ error: "Failed to get label status" });
	}
});

	return router;
}

/**
 * Register pre-training routes on the Express app
 */
export function registerPretrainingRoutes(app: Express): void {
	const router = createPretrainingRouter();
	app.use("/api/pretraining", router);
}

export default createPretrainingRouter;
