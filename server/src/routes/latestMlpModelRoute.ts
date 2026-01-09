import { createHash } from "crypto";
import type { Request, Response } from "express";
import { createReadStream, promises as fs } from "fs";
import type {
	BaselineSeedMessages,
	ModelResponseMetadata,
	PrecomputedModelPayload,
} from "../services/mlpModelArtifacts.js";

type LatestMlpModelDeps = {
	getMlpModelPath: (profileId?: string) => string;
	resolveProfileId: (
		profileId?: string,
	) => Promise<{ profileId?: string | null }>;
	seedBaselineModel: (
		filePath: string,
		messages: BaselineSeedMessages,
		logTraining: (message: string) => Promise<void>,
	) => Promise<boolean>;
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
			const resolved = await deps.resolveProfileId(rawProfileId);
			const profileId = resolved.profileId ?? undefined;

			if (rawProfileId && !profileId) {
				await deps.logTraining(
					`latest-mlp-model profile ${rawProfileId} not found in registry, falling back to global`,
				);
			}
			if (profileId && !deps.isProfileAuthorized(req, profileId)) {
				return res.status(403).json({ error: "Zugriff verweigert." });
			}

			const profiledPath = deps.getMlpModelPath(profileId);
			const globalPath = deps.getMlpModelPath();
			let chosen: string | undefined;

			if (profileId) {
				try {
					await fs.stat(profiledPath);
					chosen = profiledPath;
					await deps.logTraining(
						`latest-mlp-model resolved profile file ${profiledPath}`,
					);
				} catch {
					// fall through to global handling
				}
			}

			if (!chosen) {
				let globalAvailable = false;
				try {
					await fs.stat(globalPath);
					globalAvailable = true;
				} catch {
					const messages: BaselineSeedMessages = {
						success: (dest) => `latest-mlp-model seeded baseline into ${dest}`,
						failure: (dest, error) =>
							`latest-mlp-model failed to seed baseline into ${dest}: ${String(error)}`,
					};
					globalAvailable = await deps.seedBaselineModel(
						globalPath,
						messages,
						deps.logTraining,
					);
				}

				if (globalAvailable) {
					chosen = globalPath;
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

			const downloadName = profileId
				? `dgs_model_${profileId}.npz`
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
				deps.applyModelHeaders(res, chosen, downloadName, precomputed);
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
