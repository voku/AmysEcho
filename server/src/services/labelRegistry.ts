/**
 * LabelRegistry - Unified source of truth for DGS training labels
 *
 * Amy First: Labels are the foundation of Amy's sign language learning.
 * This registry ensures consistent label handling across:
 * - Training data (video examples)
 * - Symbol management (Metacom integration)
 * - Model training and recognition
 */

import { promises as fs } from "fs";
import path from "path";
import { SERVER_DIR } from "../constants/modelPaths.js";

export interface LabelDefinition {
/** Unique label identifier (e.g., "alle", "blau") */
id: string;
/** Display name in German (e.g., "Alle", "Blau") */
displayName: string;
/** Emoji representation */
emoji: string;
/** Category for grouping (e.g., "color", "food", "action") */
category: string;
/** Color for UI styling */
color: string;
/** Total number of training videos available */
videoCount?: number;
/** Whether landmarks have been extracted */
hasLandmarks?: boolean;
}

export interface LabelVariation {
/** Main video file */
mainVideo: string | null;
/** Variation videos (different signers, angles) */
variationVideos: string[];
/** All video files for this label */
allVideos: string[];
}

export interface LabelManifest {
version: string;
labels: LabelDefinition[];
variations: Map<string, LabelVariation>;
stats: {
totalLabels: number;
totalVideos: number;
labelsWithLandmarks: number;
};
}

const BASELINE_LABELS_PATH = path.join(
SERVER_DIR,
"data",
"config",
"defaultBaselineLabels.json",
);

const DGS_MANIFEST_PATH = path.join(
SERVER_DIR,
"data",
"dgs_manifest.json",
);

const LABEL_METADATA_PATH = path.join(
	SERVER_DIR,
	"data",
	"config",
	"labelMetadata.json",
);

/**
 * Load baseline labels from configuration
 */
export async function loadBaselineLabels(): Promise<string[]> {
try {
const content = await fs.readFile(BASELINE_LABELS_PATH, "utf8");
const labels = JSON.parse(content);
if (Array.isArray(labels) && labels.every((l) => typeof l === "string")) {
return labels;
}
console.warn("Invalid baseline labels format, using fallback");
} catch (error) {
console.warn("Failed to load baseline labels:", error);
}
// Fallback to known baseline
return [
"alle", "blau", "essen", "fertig", "gelb", "gruen",
"nochmal", "rot", "satt", "schwester", "spielen", "trinken",
];
}

/**
 * Load the DGS manifest with video mappings
 */
export async function loadDgsManifest(): Promise<{
gestures: Array<{
id: string;
label: string;
video: string | null;
variations?: { main: string[]; var: string[] };
totalVideoCount?: number;
}>;
stats?: { totalLabels: number; totalVideos: number; hasLandmarks: number };
} | null> {
try {
const content = await fs.readFile(DGS_MANIFEST_PATH, "utf8");
return JSON.parse(content);
} catch (error) {
console.warn("Failed to load DGS manifest:", error);
return null;
}
}

/**
 * Build a complete label manifest combining configuration and video data
 */
export async function buildLabelManifest(): Promise<LabelManifest> {
const baselineLabels = await loadBaselineLabels();
const dgsManifest = await loadDgsManifest();

// Pre-load label metadata from config file
await loadLabelMetadataConfig();

// Label definitions with metadata
const labelDefinitions: LabelDefinition[] = baselineLabels.map((id) => {
const gestureEntry = dgsManifest?.gestures.find((g) => g.id === id);
const videoCount = gestureEntry?.totalVideoCount ?? 0;

// Map label to category and display info
const labelMeta = getLabelMetadata(id);
return {
id,
displayName: labelMeta.displayName,
emoji: labelMeta.emoji,
category: labelMeta.category,
color: labelMeta.color,
videoCount,
hasLandmarks: videoCount > 0,
};
});

// Build variation map
const variations = new Map<string, LabelVariation>();
if (dgsManifest?.gestures) {
for (const gesture of dgsManifest.gestures) {
const mainVideos = gesture.variations?.main ?? [];
const varVideos = gesture.variations?.var ?? [];
const allVideos = [
gesture.video,
...mainVideos,
...varVideos,
].filter((v): v is string => v != null);

variations.set(gesture.id, {
mainVideo: gesture.video,
variationVideos: [...mainVideos, ...varVideos],
allVideos,
});
}
}

return {
version: dgsManifest?.stats ? "2.0" : "1.0",
labels: labelDefinitions,
variations,
stats: {
totalLabels: labelDefinitions.length,
totalVideos: dgsManifest?.stats?.totalVideos ?? 0,
labelsWithLandmarks: labelDefinitions.filter((l) => l.hasLandmarks).length,
},
};
}

type LabelMetadataEntry = {
	displayName: string;
	emoji: string;
	category: string;
	color: string;
};

// Cached label metadata loaded from config file
let cachedLabelMetadata: Record<string, LabelMetadataEntry> | null = null;

/**
 * Load label metadata from config file (with caching)
 */
async function loadLabelMetadataConfig(): Promise<Record<string, LabelMetadataEntry>> {
	if (cachedLabelMetadata) {
		return cachedLabelMetadata;
	}
	
	try {
		const content = await fs.readFile(LABEL_METADATA_PATH, "utf8");
		const parsed = JSON.parse(content);
		if (parsed.labels && typeof parsed.labels === "object") {
			cachedLabelMetadata = parsed.labels as Record<string, LabelMetadataEntry>;
			return cachedLabelMetadata;
		}
	} catch (error) {
		console.warn("Failed to load label metadata config, using fallback:", error);
	}
	
	// Fallback to hardcoded defaults if config file fails
	return FALLBACK_LABEL_METADATA;
}

// Fallback metadata for when config file is unavailable
const FALLBACK_LABEL_METADATA: Record<string, LabelMetadataEntry> = {
	alle: { displayName: "Alle", emoji: "👥", category: "person", color: "#94a3b8" },
	blau: { displayName: "Blau", emoji: "🔵", category: "color", color: "#3b82f6" },
	essen: { displayName: "Essen", emoji: "🍽️", category: "food", color: "#f59e0b" },
	fertig: { displayName: "Fertig", emoji: "✅", category: "action", color: "#22c55e" },
	gelb: { displayName: "Gelb", emoji: "🟡", category: "color", color: "#facc15" },
	gruen: { displayName: "Grün", emoji: "🟢", category: "color", color: "#22c55e" },
	nochmal: { displayName: "Nochmal", emoji: "🔁", category: "action", color: "#8b5cf6" },
	rot: { displayName: "Rot", emoji: "🔴", category: "color", color: "#ef4444" },
	satt: { displayName: "Satt", emoji: "😊", category: "feeling", color: "#10b981" },
	schwester: { displayName: "Schwester", emoji: "👧", category: "person", color: "#ec4899" },
	spielen: { displayName: "Spielen", emoji: "🧸", category: "action", color: "#f43f5e" },
	trinken: { displayName: "Trinken", emoji: "🥤", category: "food", color: "#0ea5e9" },
};

/**
 * Get metadata for a label ID (sync version using cache or fallback)
 */
function getLabelMetadata(id: string): LabelMetadataEntry {
	// Use cached metadata if available, otherwise use fallback
	const metadata = cachedLabelMetadata ?? FALLBACK_LABEL_METADATA;
	
	return metadata[id] ?? {
		displayName: id.charAt(0).toUpperCase() + id.slice(1),
		emoji: "❓",
		category: "other",
		color: "#6b7280",
	};
}

/**
 * Validate that a label exists in the registry
 */
export async function isValidLabel(label: string): Promise<boolean> {
const baselineLabels = await loadBaselineLabels();
return baselineLabels.includes(label.toLowerCase());
}

/**
 * Get video files for a label
 */
export async function getVideosForLabel(label: string): Promise<string[]> {
const manifest = await buildLabelManifest();
const variation = manifest.variations.get(label.toLowerCase());
return variation?.allVideos ?? [];
}
