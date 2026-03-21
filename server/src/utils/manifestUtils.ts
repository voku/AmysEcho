import type { ManifestEntry } from "../types.js";
import { loadTrainingManifest } from "../services/trainingJsonStore.js";

/**
 * Loads training manifest entries from the JSON file.
 * Returns an empty array if the file does not exist or is malformed.
 */
export async function loadManifestEntries(): Promise<ManifestEntry[]> {
	const manifest = loadTrainingManifest<ManifestEntry>();
	return Array.isArray(manifest.entries) ? manifest.entries : [];
}
