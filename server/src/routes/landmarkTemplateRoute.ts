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

				if (
					typeof profileId !== "string" ||
					profileId.trim().length === 0
				) {
					return res.json({ templates: [] });
				}

				if (!PROFILE_ID_PATTERN.test(profileId)) {
					return res
						.status(400)
						.json({ error: "Ungültige Profil-ID." });
				}

				const resolved = deps.resolveProfileId
					? await deps.resolveProfileId(profileId)
					: { profileId };

				if (!resolved.profileId) {
					return res
						.status(404)
						.json({ error: "Profil nicht gefunden." });
				}

				const templates = await listTemplates(resolved.profileId);
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
				const resolved = deps.resolveProfileId
					? await deps.resolveProfileId(profileId)
					: { profileId };

				if (!resolved.profileId) {
					return res
						.status(404)
						.json({ error: "Profil nicht gefunden." });
				}

				const template = await addTemplate(
					resolved.profileId,
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
				const { profileId } = req.query;
				const { id } = req.params;

				if (
					typeof profileId !== "string" ||
					profileId.trim().length === 0
				) {
					return res
						.status(400)
						.json({ error: "profileId ist erforderlich." });
				}

				if (!PROFILE_ID_PATTERN.test(profileId)) {
					return res
						.status(400)
						.json({ error: "Ungültige Profil-ID." });
				}

				const resolved = deps.resolveProfileId
					? await deps.resolveProfileId(profileId)
					: { profileId };

				if (!resolved.profileId) {
					return res
						.status(404)
						.json({ error: "Profil nicht gefunden." });
				}

				const deleted = await deleteTemplate(
					resolved.profileId,
					id,
				);
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
				const { profileId, label } = req.query;

				if (
					typeof profileId !== "string" ||
					profileId.trim().length === 0
				) {
					return res
						.status(400)
						.json({ error: "profileId ist erforderlich." });
				}

				if (typeof label !== "string" || label.trim().length === 0) {
					return res
						.status(400)
						.json({ error: "label ist erforderlich." });
				}

				if (!PROFILE_ID_PATTERN.test(profileId)) {
					return res
						.status(400)
						.json({ error: "Ungültige Profil-ID." });
				}

				const resolved = deps.resolveProfileId
					? await deps.resolveProfileId(profileId)
					: { profileId };

				if (!resolved.profileId) {
					return res
						.status(404)
						.json({ error: "Profil nicht gefunden." });
				}

				const count = await deleteTemplatesByLabel(
					resolved.profileId,
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
