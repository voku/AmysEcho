import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import {
	MLP_MODELS_DIR,
	TRAINING_UPLOADS_DIR,
} from "../constants/modelPaths.js";
import type { Database } from "../db.js";
import { atomicWriteJson } from "../utils/atomicFs.js";
import {
	loadCustomSigns,
	loadDgsSamples,
	loadTrainingManifest,
	saveCustomSigns,
	saveDgsSamples,
	saveTrainingManifest,
} from "./profileDataService.js";
import {
	createEmptyRegistry,
	ensureProfileRecord,
	type ProfileRegistry,
	UUID_REGEX,
} from "./profileRegistry.js";

type ProfileIdMapping = Map<string, string>;

function nowIso(): string {
	return new Date().toISOString();
}

function normalizeProfileId(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function ensureMapping(mapping: ProfileIdMapping, legacyId: string): string {
	const existing = mapping.get(legacyId);
	if (existing) {
		return existing;
	}
	const uuid = randomUUID();
	mapping.set(legacyId, uuid);
	return uuid;
}

async function renameDirectory(
	baseDir: string,
	fromId: string,
	toId: string,
): Promise<void> {
	const fromPath = path.join(baseDir, fromId);
	const toPath = path.join(baseDir, toId);
	if (fromPath === toPath) return;
	try {
		await fs.stat(fromPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
			return;
		}
		throw error;
	}
	await fs.mkdir(path.dirname(toPath), { recursive: true });
	await fs.rename(fromPath, toPath);
}

function ensureRegistryEntry(
	registry: ProfileRegistry,
	id: string,
	displayName?: string,
): ReturnType<typeof ensureProfileRecord> {
	return ensureProfileRecord(registry, {
		id,
		displayName,
		metadata: {},
	});
}

export async function migrateProfileIds(
	db: Database,
	registryPath: string,
): Promise<{
	registry: ProfileRegistry;
	mapping: ProfileIdMapping;
	migrated: boolean;
}> {
	let registry: ProfileRegistry;
	try {
		const raw = await fs.readFile(registryPath, "utf8");
		registry = JSON.parse(raw) as ProfileRegistry;
	} catch (error) {
		const code = (error as NodeJS.ErrnoException)?.code;
		if (code === "ENOENT") {
			registry = createEmptyRegistry();
		} else {
			throw error;
		}
	}

	const mapping: ProfileIdMapping = new Map();
	let migrated = false;

	for (const profile of db.profiles) {
		const currentId = normalizeProfileId(profile.id);
		if (!currentId) continue;
		const legacyName = (profile as { name?: string }).name;
		if (UUID_REGEX.test(currentId)) {
			const displayName = profile.displayName || legacyName || "Profil";
			profile.displayName = displayName;
			profile.createdAt = profile.createdAt || nowIso();
			ensureRegistryEntry(registry, currentId, displayName);
			continue;
		}
		const uuid = ensureMapping(mapping, currentId);
		profile.id = uuid;
		profile.displayName = profile.displayName || legacyName || "Profil";
		profile.createdAt = profile.createdAt || nowIso();
		ensureRegistryEntry(registry, uuid, profile.displayName);
		migrated = true;
	}

	for (const stat of db.usageStats) {
		const currentId = normalizeProfileId(stat.profileId);
		if (!currentId) continue;
		if (UUID_REGEX.test(currentId)) {
			continue;
		}
		stat.profileId = ensureMapping(mapping, currentId);
		migrated = true;
	}

	for (const correction of db.corrections) {
		const currentId = normalizeProfileId(correction.profileId);
		if (!currentId) continue;
		if (UUID_REGEX.test(currentId)) {
			continue;
		}
		correction.profileId = ensureMapping(mapping, currentId);
		migrated = true;
	}

	const manifest = await loadTrainingManifest();
	let manifestTouched = false;
	for (const entry of manifest.entries) {
		const profileId = normalizeProfileId(entry.profileId);
		if (!profileId) continue;
		if (UUID_REGEX.test(profileId)) {
			continue;
		}
		const mapped = ensureMapping(mapping, profileId);
		entry.profileId = mapped;
		manifestTouched = true;
	}
	if (manifestTouched) {
		await saveTrainingManifest(manifest);
		migrated = true;
	}

	const samples = await loadDgsSamples();
	let samplesTouched = false;
	for (const sample of samples.samples) {
		const profileId = normalizeProfileId(sample.profileId);
		if (!profileId) continue;
		if (UUID_REGEX.test(profileId)) {
			continue;
		}
		sample.profileId = ensureMapping(mapping, profileId);
		samplesTouched = true;
	}
	if (samplesTouched) {
		await saveDgsSamples(samples);
		migrated = true;
	}

	const customSigns = await loadCustomSigns();
	let signsTouched = false;
	for (const sign of customSigns.signs) {
		const profileId = normalizeProfileId(sign.profileId);
		if (!profileId) continue;
		if (UUID_REGEX.test(profileId)) {
			continue;
		}
		sign.profileId = ensureMapping(mapping, profileId);
		signsTouched = true;
	}
	if (signsTouched) {
		await saveCustomSigns(customSigns);
		migrated = true;
	}

	if (mapping.size > 0) {
		for (const [legacyId, uuid] of mapping.entries()) {
			await renameDirectory(TRAINING_UPLOADS_DIR, legacyId, uuid);
			await renameDirectory(MLP_MODELS_DIR, legacyId, uuid);
			ensureRegistryEntry(registry, uuid, legacyId);
		}
	}

	registry.updatedAt = nowIso();
	if (registry.profiles.length === 0 && db.profiles.length > 0) {
		for (const profile of db.profiles) {
			ensureRegistryEntry(registry, profile.id, profile.displayName);
		}
		registry.updatedAt = nowIso();
		migrated = true;
	}

	if (migrated) {
		await fs.mkdir(path.dirname(registryPath), { recursive: true });
		await atomicWriteJson(registryPath, registry);
	}

	return { registry, mapping, migrated };
}
