import { createHash } from "crypto";
import type { Request, Response } from "express";
import { createReadStream, promises as fs } from "fs";
import { PROFILE_ID_PATTERN } from "../constants/modelPaths.js";
import type {
	ModelResponseMetadata,
	PrecomputedModelPayload,
} from "../services/mlpModelArtifacts.js";

type LatestMlpModelDeps = {
	getMlpModelPath: (profileId?: string) => string;
	listAuthorizedProfileModelPaths?: (
		req: Request,
	) => Promise<Array<{ profileId: string; filePath: string; mtimeMs: number }>>;
	resolveProfileId: (
		profileId?: string,
	) => Promise<{ profileId?: string | null }>;
	sendBinaryModel: (
		res: Response,
		filePath: string,
		downloadName: string,
		options?: { precomputed?: PrecomputedModelPayload; headersOnly?: boolean },
	) => Promise<void>;
	applyModelHeaders: (
		res: Response,
		filePath: string,
		downloadName: string,
		metadata: ModelResponseMetadata,
	) => void;
	logTraining: (message: string) => Promise<void>;
	isProfileAuthorized: (req: Request, profileId: string) => boolean;
};

async function loadModelForResponse(
	filePath: string,
): Promise<PrecomputedModelPayload> {
	const stat = await fs.stat(filePath);
	const sha256 = await new Promise<string>((resolve, reject) => {
		const hash = createHash("sha256");
		const stream = createReadStream(filePath);
		stream.on("error", reject);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("end", () => resolve(hash.digest("hex")));
	});
	return {
		stat,
		sha256,
		etag: `"sha256-${sha256}"`,
	};
}

export function createLatestMlpModelHandler(deps: LatestMlpModelDeps) {
	return async function latestMlpModelHandler(req: Request, res: Response) {
		try {
			const rawProfileId =
				typeof req.query.profileId === "string"
					? req.query.profileId
					: undefined;

			if (rawProfileId && !PROFILE_ID_PATTERN.test(rawProfileId)) {
				return res.status(400).json({ error: "Ungültige Profil-ID." });
			}

			const resolved = await deps.resolveProfileId(rawProfileId);
			const profileId = resolved.profileId ?? undefined;

			if (rawProfileId && !profileId) {
				await deps.logTraining(`latest-mlp-model profile ${rawProfileId} not found`);
				return res.status(404).json({ error: "Profil nicht gefunden." });
			}
			if (profileId && !deps.isProfileAuthorized(req, profileId)) {
				return res.status(403).json({ error: "Zugriff verweigert." });
			}

			const profiledPath = deps.getMlpModelPath(profileId);
			const globalPath = deps.getMlpModelPath();
			let chosen: string | undefined;
			let chosenProfileId = profileId;

			if (profileId) {
				try {
					await fs.stat(profiledPath);
					chosen = profiledPath;
					await deps.logTraining(
						`latest-mlp-model resolved profile file ${profiledPath}`,
					);
				} catch {
					await deps.logTraining(
						`latest-mlp-model profile model not found at ${profiledPath}, falling back to global`,
					);
				}
			}

			if (!chosen && !profileId && deps.listAuthorizedProfileModelPaths) {
				const authorizedProfileModels = await deps.listAuthorizedProfileModelPaths(req);
				if (authorizedProfileModels.length > 0) {
					const newestAuthorizedProfileModel = authorizedProfileModels.reduce(
						(newest, candidate) =>
							candidate.mtimeMs > newest.mtimeMs ||
							(candidate.mtimeMs === newest.mtimeMs &&
								candidate.profileId.localeCompare(newest.profileId) < 0)
								? candidate
								: newest,
					);
					chosen = newestAuthorizedProfileModel.filePath;
					chosenProfileId = newestAuthorizedProfileModel.profileId;
					await deps.logTraining(
						`latest-mlp-model serving newest authorized profile file ${chosen} (${chosenProfileId})`,
					);
				}
			}

			if (!chosen) {
				let globalAvailable = false;
				try {
					await fs.stat(globalPath);
					globalAvailable = true;
				} catch {
					await deps.logTraining(
						`latest-mlp-model global demo model missing at ${globalPath}`,
					);
				}

				if (globalAvailable) {
					chosen = globalPath;
					chosenProfileId = undefined;
					await deps.logTraining(
						`latest-mlp-model serving global file ${globalPath}`,
					);
				}
			}

			if (!chosen) {
				await deps.logTraining(
					`latest-mlp-model missing profile=${profileId ?? "global"}`,
				);
				return res.status(404).json({ error: "Modell nicht gefunden." });
			}

			const downloadName = chosenProfileId
				? `dgs_model_${chosenProfileId}.npz`
				: "amy_model.npz";
			const precomputed = await loadModelForResponse(chosen);
			const ifNoneMatchHeader = req.headers["if-none-match"];
			const candidates =
				typeof ifNoneMatchHeader === "string"
					? ifNoneMatchHeader
							.split(",")
							.map((value) => value.trim())
							.filter((value) => value.length > 0)
					: [];

			if (candidates.includes("*") || candidates.includes(precomputed.etag)) {
				try {
					deps.applyModelHeaders(res, chosen, downloadName, precomputed);
				} catch (headerError) {
					// Contract validation failure (e.g. strict mode rejects
					// invalid/missing contracts).  Return 404 consistent with
					// sendBinaryModel instead of letting it become a 500.
					console.error(
						`latest-mlp-model 304 contract rejection: ${String(headerError)}`,
					);
					res.status(404).json({ error: "Model not found" });
					return;
				}
				res.status(304).end();
				return;
			}

			await deps.sendBinaryModel(res, chosen, downloadName, { precomputed });
		} catch (error) {
			await deps.logTraining(
				`latest-mlp-model handler error: ${String(error)}`,
			);
			res.status(500).json({ error: "Modell konnte nicht geladen werden." });
		}
	};
}
