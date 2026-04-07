import { promises as fs } from "fs";
import path from "path";
import type { Express, Request, RequestHandler, Response } from "express";
import { z } from "zod";
import type { Database } from "../db.js";
import {
	addCorrection,
	addNegativeSample,
	logCorrection,
	saveDatabase,
} from "../db.js";
import { buildLabelManifest } from "../services/labelRegistry.js";
import { appendCrashReports, type CrashReport } from "../services/crashService.js";
import { appendDgsSamples } from "../services/trainingJsonStore.js";
import { loadCustomSigns } from "../services/profileDataService.js";
import {
	buildTrainedLabelDescriptors,
	mergeTrainedLabels,
} from "../services/trainedLabelsService.js";
import type { Correction, ManifestEntry, NegativeSample } from "../types.js";
import type { withFileLock } from "../utils/fileLock.js";

type ResolveProfileId = (
	value?: string | null,
) => Promise<{ profileId: string | null }>;

interface UtilityRouteDependencies {
	authMiddleware: RequestHandler;
	apiLimiter: RequestHandler;
	dataDir: string;
	dbFilePath: string;
	getDatabase: () => Database;
	genId: () => string;
	getManifestEntries: () => Promise<ManifestEntry[]>;
	handLandmarksPerHand: number;
	totalHandLandmarks: number;
	multimodalLandmarks: number;
	profileIdPattern: RegExp;
	resolveProfileId: ResolveProfileId;
	isProfileAuthorized: (req: Request, profileId: string) => boolean;
	withFileLock: typeof withFileLock;
}

const signToString = (g: unknown): string | null => {
	if (typeof g === "string") return g;
	if (g && typeof g === "object") {
		const { left, right } = g as { left?: unknown; right?: unknown };
		if (typeof left === "string" && typeof right === "string") {
			return `${left}+${right}`;
		}
	}
	return null;
};

const SignPayloadSchema = z.object({
	sign: z.union([
		z.string().min(1),
		z.object({ left: z.string().min(1), right: z.string().min(1) }),
	]),
});

export function registerUtilityRoutes(
	app: Express,
	deps: UtilityRouteDependencies,
): void {
	app.get("/api/v1/labels", async (_req: Request, res: Response) => {
		try {
			const manifest = await buildLabelManifest();
			res.json({
				version: manifest.version,
				labels: manifest.labels,
				variations: Object.fromEntries(manifest.variations),
				stats: manifest.stats,
			});
		} catch (error) {
			console.error("Failed to load label manifest:", error);
			res.status(500).json({ error: "Fehler beim Laden der Gebärden-Labels" });
		}
	});

	app.post(
		"/api/v1/dgs/samples",
		deps.authMiddleware,
		deps.apiLimiter,
		async (req: Request, res: Response) => {
			try {
				const Body = z.object({
					label: z.string().min(1),
					profileId: z.string().optional(),
					landmarks: z
						.array(
							z.tuple([
								z.number().finite(),
								z.number().finite(),
								z.number().finite(),
							]),
						)
						.refine(
							(pts: [number, number, number][]) =>
								pts.length === deps.handLandmarksPerHand ||
								pts.length === deps.totalHandLandmarks ||
								pts.length === deps.multimodalLandmarks,
							"landmarks must be 21, 42 or 543 points",
						)
						.refine(
							(pts: [number, number, number][]) =>
								pts.every(
									([x, y, z]: [number, number, number]) =>
										x >= 0 && x <= 1 && y >= 0 && y <= 1 && Number.isFinite(z),
								),
							"landmarks must be within [0,1] for x,y",
						),
				});
				const parsed = Body.safeParse(req.body);
				if (!parsed.success) {
					return res.status(400).json({
						error:
							"Label und gültige Landmarken (21, 42 oder 543 × [x,y,z]) erforderlich.",
						details: parsed.error.flatten(),
					});
				}
				const { label, profileId, landmarks } = parsed.data;
				if (profileId && !deps.profileIdPattern.test(profileId)) {
					return res.status(400).json({ error: "Ungültige Profil-ID." });
				}
				const resolvedProfile = await deps.resolveProfileId(profileId ?? null);
				const resolvedProfileId = resolvedProfile.profileId ?? undefined;
				if (profileId && !resolvedProfileId) {
					return res.status(404).json({ error: "Profil nicht gefunden." });
				}
				if (resolvedProfileId && !deps.isProfileAuthorized(req, resolvedProfileId)) {
					return res.status(403).json({ error: "Zugriff verweigert." });
				}
				console.log(
					`Received DGS sample: label=${label}, profileId=${resolvedProfileId}, landmarks length=${landmarks.length}`,
				);
				appendDgsSamples([{
					id: deps.genId(),
					label,
					profileId: resolvedProfileId,
					landmarks,
					ts: Date.now(),
				}]);
				res.json({ status: "ok" });
			} catch (error) {
				console.error("Error saving DGS sample:", error);
				res
					.status(500)
					.json({ error: "Beispiel konnte nicht gespeichert werden." });
			}
		},
	);

	app.post(
		"/api/v1/crash-reports",
		deps.authMiddleware,
		deps.apiLimiter,
		async (req: Request, res: Response) => {
			try {
				const payload: unknown[] = Array.isArray(req.body) ? req.body : [req.body];
				const valid: CrashReport[] = [];
				for (const r of payload) {
					if (!r || typeof r !== "object") continue;
					const candidate = r as Record<string, unknown>;
					if (
						typeof candidate.message !== "string" ||
						typeof candidate.timestamp !== "number"
					) {
						continue;
					}
					valid.push({
						id:
							typeof candidate.id === "string"
								? candidate.id
								: Date.now().toString(36),
						name: typeof candidate.name === "string" ? candidate.name : "Error",
						message: candidate.message,
						stack:
							typeof candidate.stack === "string" ? candidate.stack : undefined,
						timestamp: candidate.timestamp,
						extra:
							candidate.extra && typeof candidate.extra === "object"
								? (candidate.extra as Record<string, unknown>)
								: undefined,
					});
				}
				if (!valid.length) {
					return res.status(400).json({ error: "No valid crash reports" });
				}
				await appendCrashReports(valid);
				res.status(202).json({ status: "ok", saved: valid.length });
			} catch (error) {
				console.error("Error saving crash reports:", error);
				res.status(500).json({ error: "Failed to save crash reports" });
			}
		},
	);

	app.post(
		"/api/v1/corrections",
		deps.authMiddleware,
		deps.apiLimiter,
		async (req: Request, res: Response) => {
			const parsed = SignPayloadSchema.safeParse(req.body);
			if (!parsed.success) {
				return res.status(400).json({
					error: "Invalid correction",
					details: parsed.error.flatten(),
				});
			}
			const signStr = signToString(parsed.data.sign)!;
			try {
				const db = deps.getDatabase();
				logCorrection(db, "unknown", signStr, null);
				const record: Correction = {
					id: deps.genId(),
					predictedSign: "unknown",
					actualSign: signStr,
					confidence: 0,
					timestamp: Date.now(),
					isSynced: false,
				};
				addCorrection(db, record);
				await deps.withFileLock(deps.dbFilePath, async () =>
					saveDatabase(db, deps.dbFilePath),
				);
				res.status(202).json({ status: "queued" });
			} catch (error) {
				console.error("Error logging correction:", error);
				res.status(500).json({ error: "Failed to log correction" });
			}
		},
	);

	app.post(
		"/api/v1/negative-samples",
		deps.authMiddleware,
		async (req: Request, res: Response) => {
			const parsed = SignPayloadSchema.safeParse(req.body);
			if (!parsed.success) {
				return res.status(400).json({
					error: "Invalid negative sample",
					details: parsed.error.flatten(),
				});
			}
			const signStr = signToString(parsed.data.sign)!;
			try {
				const db = deps.getDatabase();
				const record: NegativeSample = {
					id: deps.genId(),
					sign: signStr,
					timestamp: Date.now(),
				};
				addNegativeSample(db, record);
				await deps.withFileLock(deps.dbFilePath, async () =>
					saveDatabase(db, deps.dbFilePath),
				);
				res.status(202).json({ status: "queued" });
			} catch (error) {
				console.error("Error logging negative sample:", error);
				res.status(500).json({ error: "Failed to log negative sample" });
			}
		},
	);

	app.get(
		"/api/v1/dgs/trained-labels",
		deps.authMiddleware,
		async (req: Request, res: Response) => {
			try {
				const profileId =
					typeof req.query.profileId === "string"
						? req.query.profileId
						: undefined;
				if (!profileId) {
					return res.status(400).json({ error: "profileId required" });
				}
				if (!deps.isProfileAuthorized(req, profileId)) {
					return res.status(403).json({ error: "Zugriff verweigert." });
				}

				const manifestEntries = await deps.getManifestEntries();
				const trainedLabels = mergeTrainedLabels(profileId, manifestEntries);
				const customSigns = await loadCustomSigns();
				const labelDescriptors = buildTrainedLabelDescriptors(
					profileId,
					trainedLabels,
					Array.isArray(customSigns.signs) ? customSigns.signs : [],
				);

				res.json({ profileId, trainedLabels, labelDescriptors });
			} catch (error) {
				console.error("Failed to get trained labels:", error);
				res.status(500).json({ error: "Internal server error" });
			}
		},
	);

	app.get(
		"/api/v1/config/normalization",
		deps.authMiddleware,
		async (_req: Request, res: Response) => {
			try {
				const configPath = path.join(
					deps.dataDir,
					"config",
					"normalization_config.json",
				);
				const raw = await fs.readFile(configPath, "utf8");
				res.json(JSON.parse(raw));
			} catch {
				res.json({
					priority_factors: {
						hands: 4.0,
						pose: 0.2,
						face: 0.05,
					},
				});
			}
		},
	);
}
