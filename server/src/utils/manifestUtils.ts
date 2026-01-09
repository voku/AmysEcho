import { promises as fs } from "fs";
import { TRAINING_MANIFEST_PATH } from "../constants/modelPaths.js";
import type { ManifestEntry } from "../types.js";

/**
 * Loads training manifest entries from the JSON file.
 * Returns an empty array if the file does not exist or is malformed.
 */
export async function loadManifestEntries(): Promise<ManifestEntry[]> {
	try {
		const manifestRaw = await fs.readFile(TRAINING_MANIFEST_PATH, "utf8");
		const manifest = JSON.parse(manifestRaw);
		return Array.isArray(manifest?.entries) ? manifest.entries : [];
	} catch (err: unknown) {
		// NodeJS.ErrnoException is not globally available in TS without types/node
		const code = (err as any)?.code;
		if (code !== "ENOENT") {
			console.error("Failed to load or parse training manifest:", err);
		}
		return [];
	}
}
