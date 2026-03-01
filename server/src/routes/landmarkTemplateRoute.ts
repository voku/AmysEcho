import type { Express, Request, Response } from "express";
import { PROFILE_ID_PATTERN } from "../constants/modelPaths.js";
import { auth } from "../middleware/auth.js";
import {
	LandmarkTemplateRequestSchema,
	addTemplate,
	deleteTemplate,
	deleteTemplatesByLabel,
	listTemplates,
} from "../services/landmarkTemplateStore.js";

/**
 * Landmark Template Route
 *
 * REST API for managing landmark templates used for custom gesture detection.
 * Templates store canonical hand shapes (normalized landmark positions) that
 * can be matched against live landmarks using Euclidean distance on the client.
 *
 * Endpoints:
 *   GET    /api/v1/landmarks/templates?profileId=...            List templates
 *   POST   /api/v1/landmarks/templates                          Add template
 *   DELETE /api/v1/landmarks/templates/:id?profileId=...        Delete template
 *   DELETE /api/v1/landmarks/templates?profileId=...&label=...  Delete by label
 */

type LandmarkTemplateDeps = {
	resolveProfileId?: (
		profileId: string | null,
	) => Promise<{ profileId: string | null }>;
};

type ProfileResolution =
	| { ok: true; profileId: string }
	| { ok: false; status: number; error: string };

async function resolveRequiredProfile(
	profileId: unknown,
	deps: LandmarkTemplateDeps,
): Promise<ProfileResolution> {
	if (typeof profileId !== "string" || profileId.trim().length === 0) {
		return { ok: false, status: 400, error: "profileId ist erforderlich." };
	}
	if (!PROFILE_ID_PATTERN.test(profileId)) {
		return { ok: false, status: 400, error: "Ungültige Profil-ID." };
	}
	const resolved = deps.resolveProfileId
		? await deps.resolveProfileId(profileId)
		: { profileId };
	if (!resolved.profileId) {
		return { ok: false, status: 404, error: "Profil nicht gefunden." };
	}
	return { ok: true, profileId: resolved.profileId };
}

export function registerLandmarkTemplateRoute(
	app: Express,
	deps: LandmarkTemplateDeps = {},
): void {
	// --- LIST templates ---
	app.get(
		"/api/v1/landmarks/templates",
		auth,
		async (req: Request, res: Response) => {
			try {
				const { profileId } = req.query;

				// GET returns empty list when no profileId is provided
				if (
					typeof profileId !== "string" ||
					profileId.trim().length === 0
				) {
					return res.json({ templates: [] });
				}

				const result = await resolveRequiredProfile(profileId, deps);
				if (!result.ok) {
					return res.status(result.status).json({ error: result.error });
				}

				const templates = await listTemplates(result.profileId);
				return res.json({ templates });
			} catch (error: unknown) {
				console.error("Failed to list landmark templates", error);
				return res.status(500).json({
					error: "Landmark-Vorlagen konnten nicht geladen werden.",
				});
			}
		},
	);

	// --- ADD template ---
	app.post(
		"/api/v1/landmarks/templates",
		auth,
		async (req: Request, res: Response) => {
			const parsed = LandmarkTemplateRequestSchema.safeParse(req.body);
			if (!parsed.success) {
				return res.status(400).json({
					error: "Ungültige Vorlagen-Daten.",
					details: parsed.error.flatten(),
				});
			}

			const { label, profileId, landmarks, handedness } = parsed.data;

			try {
				const result = await resolveRequiredProfile(profileId, deps);
				if (!result.ok) {
					return res.status(result.status).json({ error: result.error });
				}

				const template = await addTemplate(
					result.profileId,
					label,
					landmarks,
					handedness,
				);

				return res.status(201).json(template);
			} catch (error: unknown) {
				console.error("Failed to store landmark template", error);
				return res.status(500).json({
					error: "Landmark-Vorlage konnte nicht gespeichert werden.",
				});
			}
		},
	);

	// --- DELETE single template by ID ---
	app.delete(
		"/api/v1/landmarks/templates/:id",
		auth,
		async (req: Request, res: Response) => {
			try {
				const { id } = req.params;

				const result = await resolveRequiredProfile(req.query.profileId, deps);
				if (!result.ok) {
					return res.status(result.status).json({ error: result.error });
				}

				const deleted = await deleteTemplate(result.profileId, id);
				if (!deleted) {
					return res
						.status(404)
						.json({ error: "Vorlage nicht gefunden." });
				}

				return res.json({ deleted: true });
			} catch (error: unknown) {
				console.error("Failed to delete landmark template", error);
				return res.status(500).json({
					error: "Landmark-Vorlage konnte nicht gelöscht werden.",
				});
			}
		},
	);

	// --- DELETE all templates for a label ---
	app.delete(
		"/api/v1/landmarks/templates",
		auth,
		async (req: Request, res: Response) => {
			try {
				const { label } = req.query;

				if (typeof label !== "string" || label.trim().length === 0) {
					return res
						.status(400)
						.json({ error: "label ist erforderlich." });
				}

				const result = await resolveRequiredProfile(req.query.profileId, deps);
				if (!result.ok) {
					return res.status(result.status).json({ error: result.error });
				}

				const count = await deleteTemplatesByLabel(
					result.profileId,
					label,
				);
				return res.json({ deleted: count });
			} catch (error: unknown) {
				console.error(
					"Failed to delete landmark templates by label",
					error,
				);
				return res.status(500).json({
					error: "Landmark-Vorlagen konnten nicht gelöscht werden.",
				});
			}
		},
	);
}
