import type { Express, NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { promises as fs } from "fs";
import path from "path";
import {
	getProfileMetacomBundlePath,
	PROFILE_ID_PATTERN,
} from "../constants/modelPaths.js";
import { logger } from "../services/logger.js";

type MetacomRouteDeps = {
	authMiddleware: (req: Request, res: Response, next: NextFunction) => void;
};

// Maximum bundle JSON size. Metacom bundles with the default boards are ~5 KB.
// 1 MB allows for very large custom board sets while preventing abuse.
const MAX_BUNDLE_SIZE = 1_048_576; // 1 MB

export function registerMetacomRoutes(
	app: Express,
	deps: MetacomRouteDeps,
): void {
	const { authMiddleware } = deps;

	const metacomRateLimiter = rateLimit({
		windowMs: 15 * 60 * 1000, // 15 minutes
		max: 60, // limit each IP to 60 metacom requests per window
		standardHeaders: true,
		legacyHeaders: false,
		message: {
			error: "Zu viele Anfragen. Bitte versuchen Sie es später erneut.",
		},
	});

	/**
	 * GET /api/v1/profiles/:id/metacom-bundle
	 * Returns the stored Metacom bundle for a profile (or 404).
	 */
	app.get(
		"/api/v1/profiles/:id/metacom-bundle",
		authMiddleware,
		metacomRateLimiter,
		async (req: Request, res: Response) => {
			const profileId = req.params.id;
			if (!profileId || !PROFILE_ID_PATTERN.test(profileId)) {
				return res.status(400).json({ error: "Ungültige Profil-ID." });
			}

			const bundlePath = getProfileMetacomBundlePath(profileId);
			try {
				const raw = await fs.readFile(bundlePath, "utf8");
				res.setHeader("Content-Type", "application/json");
				return res.status(200).send(raw);
			} catch (error: any) {
				if (error?.code === "ENOENT") {
					return res
						.status(404)
						.json({ error: "Kein Metacom-Bundle für dieses Profil." });
				}
				logger.error("Failed to load Metacom bundle", {
					profileId,
					error: error instanceof Error ? error.message : String(error),
				});
				return res
					.status(500)
					.json({ error: "Metacom-Bundle konnte nicht geladen werden." });
			}
		},
	);

	/**
	 * PUT /api/v1/profiles/:id/metacom-bundle
	 * Store/replace the Metacom bundle for a profile.
	 * Expects JSON body with `{ version, boards[] }`.
	 */
	app.put(
		"/api/v1/profiles/:id/metacom-bundle",
		authMiddleware,
		metacomRateLimiter,
		async (req: Request, res: Response) => {
			const profileId = req.params.id;
			if (!profileId || !PROFILE_ID_PATTERN.test(profileId)) {
				return res.status(400).json({ error: "Ungültige Profil-ID." });
			}

			const body = req.body;
			if (
				!body ||
				typeof body !== "object" ||
				typeof body.version !== "string" ||
				!Array.isArray(body.boards)
			) {
				return res
					.status(400)
					.json({ error: "Ungültiges Metacom-Bundle-Format." });
			}

			const raw = JSON.stringify(body, null, 2);
			if (raw.length > MAX_BUNDLE_SIZE) {
				return res
					.status(413)
					.json({ error: "Metacom-Bundle ist zu groß (max 1 MB)." });
			}

			const bundlePath = getProfileMetacomBundlePath(profileId);
			try {
				await fs.mkdir(path.dirname(bundlePath), { recursive: true });
				await fs.writeFile(bundlePath, raw, "utf8");
				logger.info("Metacom bundle saved", { profileId });
				return res.status(200).json({ ok: true });
			} catch (error) {
				logger.error("Failed to save Metacom bundle", {
					profileId,
					error: error instanceof Error ? error.message : String(error),
				});
				return res
					.status(500)
					.json({ error: "Metacom-Bundle konnte nicht gespeichert werden." });
			}
		},
	);

	/**
	 * DELETE /api/v1/profiles/:id/metacom-bundle
	 * Remove the stored Metacom bundle for a profile.
	 */
	app.delete(
		"/api/v1/profiles/:id/metacom-bundle",
		authMiddleware,
		metacomRateLimiter,
		async (req: Request, res: Response) => {
			const profileId = req.params.id;
			if (!profileId || !PROFILE_ID_PATTERN.test(profileId)) {
				return res.status(400).json({ error: "Ungültige Profil-ID." });
			}

			const bundlePath = getProfileMetacomBundlePath(profileId);
			try {
				await fs.unlink(bundlePath);
				logger.info("Metacom bundle deleted", { profileId });
				return res.status(200).json({ ok: true });
			} catch (error: any) {
				if (error?.code === "ENOENT") {
					return res.status(200).json({ ok: true });
				}
				logger.error("Failed to delete Metacom bundle", {
					profileId,
					error: error instanceof Error ? error.message : String(error),
				});
				return res
					.status(500)
					.json({ error: "Metacom-Bundle konnte nicht gelöscht werden." });
			}
		},
	);
}
