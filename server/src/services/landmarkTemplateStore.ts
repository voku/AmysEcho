import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import {
	DATA_DIR,
	PROFILE_ID_PATTERN,
	ensureDataDir,
} from "../constants/modelPaths.js";
import { atomicWriteJson } from "../utils/atomicFs.js";
import { withFileLock } from "../utils/fileLock.js";

/**
 * Landmark Template Store
 *
 * Stores per-profile landmark templates that encode the canonical hand shape
 * for each custom gesture label. Templates are arrays of normalized [x, y, z]
 * triplets (21 points per hand, optionally 42 for two-hand gestures).
 *
 * During detection the webapp compares live landmarks against these templates
 * using Euclidean distance – a simple, reliable approach that complements the
 * existing MLP pipeline.
 */

const TEMPLATES_DIR = path.join(DATA_DIR, "landmark_templates");

function getTemplatesPath(profileId: string): string {
	return path.join(TEMPLATES_DIR, profileId, "templates.json");
}

// --- Zod schemas ---

const LandmarkPointSchema = z.tuple([
	z.number().finite(),
	z.number().finite(),
	z.number().finite(),
]);

export const LandmarkTemplateRequestSchema = z.object({
	label: z.string().min(1).max(120),
	profileId: z.string().regex(PROFILE_ID_PATTERN, "Ungültige Profil-ID"),
	// 21 points (single hand) or 42 points (two hands)
	landmarks: z
		.array(LandmarkPointSchema)
		.refine(
			(pts) => pts.length === 21 || pts.length === 42,
			"landmarks must be 21 or 42 points",
		),
	handedness: z.enum(["left", "right", "both"]).default("right"),
});

const StoredTemplateSchema = z.object({
	id: z.string(),
	label: z.string(),
	profileId: z.string(),
	landmarks: z.array(z.tuple([z.number(), z.number(), z.number()])),
	handedness: z.enum(["left", "right", "both"]),
	createdAt: z.string(),
});

const TemplateStoreSchema = z.object({
	version: z.number().int().min(1),
	templates: z.array(StoredTemplateSchema),
});

export type StoredTemplate = z.infer<typeof StoredTemplateSchema>;
type TemplateStore = z.infer<typeof TemplateStoreSchema>;

// --- Helpers ---

function generateTemplateId(): string {
	return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function readStore(profileId: string): Promise<TemplateStore> {
	await ensureDataDir();
	const templatesPath = getTemplatesPath(profileId);
	try {
		const raw = await fs.readFile(templatesPath, "utf8");
		const parsed = JSON.parse(raw);
		const result = TemplateStoreSchema.safeParse(parsed);
		if (result.success) {
			return result.data;
		}
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
			throw error;
		}
	}
	return { version: 1, templates: [] };
}

async function writeStore(
	profileId: string,
	store: TemplateStore,
): Promise<void> {
	const templatesPath = getTemplatesPath(profileId);
	await fs.mkdir(path.dirname(templatesPath), { recursive: true });
	await atomicWriteJson(templatesPath, store);
}

// --- Public API ---

export async function listTemplates(
	profileId: string,
): Promise<StoredTemplate[]> {
	if (!PROFILE_ID_PATTERN.test(profileId)) {
		throw new Error("Ungültige Profil-ID");
	}
	const store = await readStore(profileId);
	return store.templates;
}

export async function addTemplate(
	profileId: string,
	label: string,
	landmarks: [number, number, number][],
	handedness: "left" | "right" | "both",
): Promise<StoredTemplate> {
	if (!PROFILE_ID_PATTERN.test(profileId)) {
		throw new Error("Ungültige Profil-ID");
	}

	const templatesPath = getTemplatesPath(profileId);
	const template: StoredTemplate = {
		id: generateTemplateId(),
		label: label.trim().toLowerCase(),
		profileId,
		landmarks,
		handedness,
		createdAt: new Date().toISOString(),
	};

	await withFileLock(templatesPath, async () => {
		const store = await readStore(profileId);
		store.templates.push(template);
		await writeStore(profileId, store);
	});

	return template;
}

export async function deleteTemplate(
	profileId: string,
	templateId: string,
): Promise<boolean> {
	if (!PROFILE_ID_PATTERN.test(profileId)) {
		throw new Error("Ungültige Profil-ID");
	}

	const templatesPath = getTemplatesPath(profileId);
	let deleted = false;

	await withFileLock(templatesPath, async () => {
		const store = await readStore(profileId);
		const before = store.templates.length;
		store.templates = store.templates.filter((t) => t.id !== templateId);
		deleted = store.templates.length < before;
		if (deleted) {
			await writeStore(profileId, store);
		}
	});

	return deleted;
}

export async function deleteTemplatesByLabel(
	profileId: string,
	label: string,
): Promise<number> {
	if (!PROFILE_ID_PATTERN.test(profileId)) {
		throw new Error("Ungültige Profil-ID");
	}

	const normalizedLabel = label.trim().toLowerCase();
	const templatesPath = getTemplatesPath(profileId);
	let removedCount = 0;

	await withFileLock(templatesPath, async () => {
		const store = await readStore(profileId);
		const before = store.templates.length;
		store.templates = store.templates.filter(
			(t) => t.label !== normalizedLabel,
		);
		removedCount = before - store.templates.length;
		if (removedCount > 0) {
			await writeStore(profileId, store);
		}
	});

	return removedCount;
}
