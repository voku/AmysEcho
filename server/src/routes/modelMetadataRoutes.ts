import { createHash } from "crypto";
import type { Express, Request, RequestHandler, Response } from "express";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "../constants/modelPaths.js";

interface RegisterModelMetadataRoutesDeps {
	authMiddleware: RequestHandler;
	modelMetadataLimiter: RequestHandler;
	readServerPackageJson: () => Promise<Record<string, unknown>>;
	collectLabelCounts: () => Promise<{
		profileCounts: Map<string, Record<string, number>>;
	}>;
	getMlpModelPath: (profileId?: string) => string;
	isProfileAuthorized: (req: Request, profileId: string) => boolean;
	profileIdPattern: RegExp;
}

async function resolveModelFile(
	profileId: string | undefined,
	res: Response,
	getPath: (profileId?: string) => string,
): Promise<string | undefined> {
	let file: string;
	try {
		file = getPath(profileId);
	} catch {
		res.status(400).json({ error: "Invalid profileId" });
		return;
	}

	const base = await fs.realpath(DATA_DIR).catch(() => path.resolve(DATA_DIR));
	const normalizedFile = path.resolve(file);
	const preCheckRelative = path.relative(base, normalizedFile);
	if (preCheckRelative.startsWith("..") || path.isAbsolute(preCheckRelative)) {
		res.status(403).json({ error: "Forbidden" });
		return;
	}

	const resolvedFile = await fs
		.realpath(normalizedFile)
		.catch(() => normalizedFile);
	const postCheckRelative = path.relative(base, resolvedFile);
	if (
		postCheckRelative.startsWith("..") ||
		path.isAbsolute(postCheckRelative)
	) {
		res.status(403).json({ error: "Forbidden" });
		return;
	}

	return resolvedFile;
}

export function registerModelMetadataRoutes(
	app: Express,
	deps: RegisterModelMetadataRoutesDeps,
): void {
	app.get(
		"/api/v1/models/version",
		deps.authMiddleware,
		deps.modelMetadataLimiter,
		async (_req: Request, res: Response) => {
			try {
				const pkg = await deps.readServerPackageJson();
				const { version } = pkg;
				res.json({ version, modelPath: "/api/v1/models/latest" });
			} catch (err) {
				console.error("Failed to read model version:", err);
				res.status(500).json({ error: "Failed to read model version" });
			}
		},
	);

	app.get(
		"/api/v1/models/metadata",
		deps.authMiddleware,
		deps.modelMetadataLimiter,
		async (req: Request, res: Response) => {
			const profileId =
				typeof req.query.profileId === "string" ? req.query.profileId : undefined;
			if (profileId && !deps.isProfileAuthorized(req, profileId)) {
				return res.status(403).json({ error: "Zugriff verweigert." });
			}

			const resolvedFile = await resolveModelFile(profileId, res, deps.getMlpModelPath);
			if (!resolvedFile) return;
			try {
				const pkg = await deps.readServerPackageJson();
				const { version } = pkg;
				const stat = await fs.stat(resolvedFile);
				const buf = await fs.readFile(resolvedFile);
				const sha256 = createHash("sha256").update(buf).digest("hex");
				res.json({ version, size: stat.size, sha256 });
			} catch (err) {
				console.error("Failed to read model metadata:", err);
				res.status(404).json({ error: "Model not found" });
			}
		},
	);

	app.get(
		"/api/v1/models/profiles",
		deps.authMiddleware,
		deps.modelMetadataLimiter,
		async (req: Request, res: Response) => {
			try {
				const { profileCounts } = await deps.collectLabelCounts();
				interface ProfileInfo {
					profileId: string;
					modelAvailable: boolean;
					signCount: number;
					lastUpdated?: Date;
				}
				const profiles: ProfileInfo[] = [];

				const modelsDir = path.join(DATA_DIR, "models");
				let modelDirs: string[] = [];
				try {
					modelDirs = await fs.readdir(modelsDir);
				} catch {
					// Models dir might not exist yet
				}

				for (const pid of modelDirs) {
					if (pid === "global" || !deps.profileIdPattern.test(pid)) continue;
					if (!deps.isProfileAuthorized(req, pid)) continue;

					const modelPath = deps.getMlpModelPath(pid);
					let modelAvailable = false;
					let lastUpdated: Date | undefined;
					try {
						const stat = await fs.stat(modelPath);
						modelAvailable = true;
						lastUpdated = stat.mtime;
					} catch {
						// Model not built yet
					}

					const counts = profileCounts.get(pid) || {};
					const signCount = Object.values(counts).reduce((a, b) => a + b, 0);
					profiles.push({
						profileId: pid,
						modelAvailable,
						signCount,
						...(lastUpdated ? { lastUpdated } : {}),
					});
				}

				for (const [pid, counts] of profileCounts.entries()) {
					if (!profiles.find((profile) => profile.profileId === pid)) {
						if (deps.isProfileAuthorized(req, pid)) {
							profiles.push({
								profileId: pid,
								modelAvailable: false,
								signCount: Object.values(counts).reduce((a, b) => a + b, 0),
							});
						}
					}
				}

				res.json(profiles);
			} catch (error) {
				console.error("Failed to list profile models:", error);
				res.status(500).json({ error: "Internal server error" });
			}
		},
	);
}
