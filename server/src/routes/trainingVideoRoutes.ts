import type { Express, NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { createReadStream, promises as fs, existsSync } from "fs";
import path from "path";
import {
	DATA_DIR,
	PROFILE_ID_PATTERN,
	SERVER_DIR,
} from "../constants/modelPaths.js";
import type { Database } from "../db.js";
import type { ProfileRegistry } from "../services/profileRegistry.js";
import { logger } from "../services/logger.js";
import { loadTrainingManifest } from "../services/trainingJsonStore.js";
import { isProfileAuthorized } from "../utils/profileAuthorization.js";

type TrainingVideoRouteDeps = {
	authMiddleware: (req: Request, res: Response, next: NextFunction) => void;
	db: Database;
	registry: ProfileRegistry;
};

interface ManifestEntry {
	id: string;
	profileId?: string | null;
	label: string;
	symbolId?: string;
	capturedAt?: string | null;
	source?: string | null;
	storage: {
		directory: string;
		clip?: string;
		still?: string;
		files: string[];
	};
	metadata?: {
		recording?: {
			clipDurationMs?: number;
			clipBytes?: number;
			clipMimeType?: string;
			stillBytes?: number;
			stillMimeType?: string;
		};
		[key: string]: unknown;
	};
	receivedAt: string;
}

interface ManifestFile {
	entries: ManifestEntry[];
}

interface TrainingVideoItem {
	bundleId: string;
	label: string;
	symbolId?: string;
	capturedAt: string | null;
	clipUrl: string | null;
	stillUrl: string | null;
	clipDurationMs: number | null;
	clipMimeType: string | null;
}

const ALLOWED_CLIP_EXTENSIONS = new Set([
	".webm",
	".mp4",
	".mov",
	".avi",
	".mkv",
]);
const ALLOWED_STILL_EXTENSIONS = new Set([
	".jpg",
	".jpeg",
	".png",
	".webp",
]);

const CLIP_MIME_MAP: Record<string, string> = {
	".webm": "video/webm",
	".mp4": "video/mp4",
	".mov": "video/quicktime",
	".avi": "video/x-msvideo",
	".mkv": "video/x-matroska",
};

const STILL_MIME_MAP: Record<string, string> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".webp": "image/webp",
};

const DGS_VIDEO_DIR = path.join(SERVER_DIR, "data", "dgs_video_examples");
const DGS_MANIFEST_PATH = path.join(SERVER_DIR, "data", "dgs_manifest.json");

interface DgsManifestGesture {
	id: string;
	label: string;
	videos: string[];
	totalVideoCount: number;
}

interface DgsManifest {
	gestures: DgsManifestGesture[];
}

interface DgsReferenceVideoItem {
	label: string;
	filename: string;
	clipUrl: string;
}

async function loadDgsManifest(): Promise<DgsManifest> {
	try {
		const raw = await fs.readFile(DGS_MANIFEST_PATH, "utf8");
		return JSON.parse(raw) as DgsManifest;
	} catch (error) {
		logger.warn("Failed to load DGS manifest, returning empty.", {
			error: error instanceof Error ? error.message : String(error),
		});
		return { gestures: [] };
	}
}

async function loadManifest(): Promise<ManifestFile> {
	return loadTrainingManifest<ManifestEntry>() as ManifestFile;
}

export function registerTrainingVideoRoutes(
	app: Express,
	deps: TrainingVideoRouteDeps,
): void {
	const { authMiddleware, db, registry } = deps;

	const videoRateLimiter = rateLimit({
		windowMs: 15 * 60 * 1000,
		max: 120,
		standardHeaders: true,
		legacyHeaders: false,
		message: {
			error: "Zu viele Anfragen. Bitte versuchen Sie es später erneut.",
		},
	});

	/**
	 * GET /api/v1/profiles/:id/training-videos
	 * List all training video clips for a profile, grouped by label.
	 */
	app.get(
		"/api/v1/profiles/:id/training-videos",
		authMiddleware,
		videoRateLimiter,
		async (req: Request, res: Response) => {
			const profileId = req.params.id;
			if (!profileId || !PROFILE_ID_PATTERN.test(profileId)) {
				return res.status(400).json({ error: "Ungültige Profil-ID." });
			}

			if (!isProfileAuthorized(req, profileId, db, registry)) {
				return res.status(403).json({ error: "Zugriff verweigert." });
			}

			try {
				const manifest = await loadManifest();
				const profileEntries = manifest.entries.filter(
					(entry) =>
						entry.profileId === profileId &&
						entry.storage?.clip,
				);

				const videos: TrainingVideoItem[] = profileEntries.map(
					(entry) => ({
						bundleId: entry.id,
						label: entry.label,
						symbolId: entry.symbolId,
						capturedAt: entry.capturedAt ?? null,
						clipUrl: `/api/v1/training-videos/${entry.id}/clip`,
						stillUrl: entry.storage?.still
							? `/api/v1/training-videos/${entry.id}/still`
							: null,
						clipDurationMs:
							entry.metadata?.recording?.clipDurationMs ?? null,
						clipMimeType:
							entry.metadata?.recording?.clipMimeType ?? null,
					}),
				);

				return res.status(200).json({ profileId, videos });
			} catch (error) {
				logger.error("Failed to list training videos", {
					profileId,
					error:
						error instanceof Error
							? error.message
							: String(error),
				});
				return res.status(500).json({
					error: "Trainingsvideos konnten nicht geladen werden.",
				});
			}
		},
	);

	/**
	 * GET /api/v1/training-videos/:bundleId/clip
	 * Stream the video clip file from a training bundle.
	 * 
	 * PRIVACY: Only the user who recorded the video (or their authorized caregivers)
	 * can access it. This protects the privacy of kids with special needs by ensuring
	 * videos are never accessible to unauthorized users, even if they guess the bundleId.
	 */
	app.get(
		"/api/v1/training-videos/:bundleId/clip",
		authMiddleware,
		videoRateLimiter,
		async (req: Request, res: Response) => {
			const { bundleId } = req.params;
			if (!bundleId) {
				return res.status(400).json({ error: "Bundle-ID fehlt." });
			}

			try {
				const manifest = await loadManifest();
				const entry = manifest.entries.find(
					(e) => e.id === bundleId,
				);
				if (!entry || !entry.storage?.clip) {
					return res
						.status(404)
						.json({ error: "Video nicht gefunden." });
				}

				// PRIVACY PROTECTION: Verify user has access to the profile that owns this bundle.
				// Deny access when profileId is missing (legacy bundles) to prevent
				// unauthenticated access via guessed bundleIds.
				// Authorization is granted if:
				// 1. The user owns the profile (profile.userId === user.id)
				// 2. The user is a caregiver with access to the profile
				if (!entry.profileId || !isProfileAuthorized(req, entry.profileId, db, registry)) {
					return res
						.status(403)
						.json({ error: "Zugriff verweigert." });
				}

				const clipPath = path.join(
					DATA_DIR,
					entry.storage.directory,
					entry.storage.clip,
				);
				const resolvedPath = path.resolve(clipPath);

				// Path traversal protection
				if (!resolvedPath.startsWith(path.resolve(DATA_DIR))) {
					return res
						.status(403)
						.json({ error: "Zugriff verweigert." });
				}

				const ext = path.extname(entry.storage.clip).toLowerCase();
				if (!ALLOWED_CLIP_EXTENSIONS.has(ext)) {
					return res
						.status(400)
						.json({ error: "Ungültiges Videoformat." });
				}

				if (!existsSync(resolvedPath)) {
					return res
						.status(404)
						.json({ error: "Videodatei nicht gefunden." });
				}

				const stat = await fs.stat(resolvedPath);
				const mimeType =
					entry.metadata?.recording?.clipMimeType ??
					CLIP_MIME_MAP[ext] ??
					"application/octet-stream";

				res.setHeader("Content-Type", mimeType);
				res.setHeader("Content-Length", stat.size);
				res.setHeader("Accept-Ranges", "bytes");

				// Support range requests for video seeking
				const range = req.headers.range;
				if (range) {
					const parts = range.replace(/bytes=/, "").split("-");
					const start = parseInt(parts[0] || "0", 10);
					const end = parts[1]
						? parseInt(parts[1], 10)
						: stat.size - 1;
					if (
						start >= stat.size ||
						end >= stat.size ||
						start > end
					) {
						res.status(416).setHeader(
							"Content-Range",
							`bytes */${stat.size}`,
						);
						return res.end();
					}
					res.status(206);
					res.setHeader(
						"Content-Range",
						`bytes ${start}-${end}/${stat.size}`,
					);
					res.setHeader("Content-Length", end - start + 1);
					createReadStream(resolvedPath, { start, end }).pipe(res);
				} else {
					createReadStream(resolvedPath).pipe(res);
				}
			} catch (error) {
				logger.error("Failed to serve training video clip", {
					bundleId,
					error:
						error instanceof Error
							? error.message
							: String(error),
				});
				return res.status(500).json({
					error: "Video konnte nicht abgespielt werden.",
				});
			}
		},
	);

	/**
	 * GET /api/v1/training-videos/:bundleId/still
	 * Serve the still image from a training bundle.
	 * 
	 * PRIVACY: Only the user who recorded the video (or their authorized caregivers)
	 * can access the still image. This protects the privacy of kids with special needs
	 * by ensuring images are never accessible to unauthorized users.
	 */
	app.get(
		"/api/v1/training-videos/:bundleId/still",
		authMiddleware,
		videoRateLimiter,
		async (req: Request, res: Response) => {
			const { bundleId } = req.params;
			if (!bundleId) {
				return res.status(400).json({ error: "Bundle-ID fehlt." });
			}

			try {
				const manifest = await loadManifest();
				const entry = manifest.entries.find(
					(e) => e.id === bundleId,
				);
				if (!entry || !entry.storage?.still) {
					return res
						.status(404)
						.json({ error: "Bild nicht gefunden." });
				}

				// PRIVACY PROTECTION: Verify user has access to the profile that owns this bundle.
				// Deny access when profileId is missing to prevent unauthenticated access
				// via guessed bundleIds.
				// Authorization is granted if:
				// 1. The user owns the profile (profile.userId === user.id)
				// 2. The user is a caregiver with access to the profile
				if (!entry.profileId || !isProfileAuthorized(req, entry.profileId, db, registry)) {
					return res
						.status(403)
						.json({ error: "Zugriff verweigert." });
				}

				const stillPath = path.join(
					DATA_DIR,
					entry.storage.directory,
					entry.storage.still,
				);
				const resolvedPath = path.resolve(stillPath);

				if (!resolvedPath.startsWith(path.resolve(DATA_DIR))) {
					return res
						.status(403)
						.json({ error: "Zugriff verweigert." });
				}

				const ext = path.extname(entry.storage.still).toLowerCase();
				if (!ALLOWED_STILL_EXTENSIONS.has(ext)) {
					return res
						.status(400)
						.json({ error: "Ungültiges Bildformat." });
				}

				if (!existsSync(resolvedPath)) {
					return res
						.status(404)
						.json({ error: "Bilddatei nicht gefunden." });
				}

				const mimeType =
					STILL_MIME_MAP[ext] ?? "application/octet-stream";
				res.setHeader("Content-Type", mimeType);
				createReadStream(resolvedPath).pipe(res);
			} catch (error) {
				logger.error("Failed to serve training still image", {
					bundleId,
					error:
						error instanceof Error
							? error.message
							: String(error),
				});
				return res.status(500).json({
					error: "Bild konnte nicht geladen werden.",
				});
			}
		},
	);

	/**
	 * GET /api/v1/dgs-videos
	 * List all available DGS reference videos from the downloaded examples,
	 * grouped by label. These are pre-recorded reference videos for learning.
	 */
	app.get(
		"/api/v1/dgs-videos",
		authMiddleware,
		videoRateLimiter,
		async (_req: Request, res: Response) => {
			try {
				const dgsManifest = await loadDgsManifest();
				const videos: DgsReferenceVideoItem[] = [];
				for (const gesture of dgsManifest.gestures) {
					for (const filename of gesture.videos) {
						const ext = path.extname(filename).toLowerCase();
						if (!ALLOWED_CLIP_EXTENSIONS.has(ext)) continue;
						videos.push({
							label: gesture.label,
							filename,
							clipUrl: `/api/v1/dgs-videos/${encodeURIComponent(filename)}`,
						});
					}
				}
				return res.status(200).json({ videos });
			} catch (error) {
				logger.error("Failed to list DGS reference videos", {
					error:
						error instanceof Error
							? error.message
							: String(error),
				});
				return res.status(500).json({
					error: "Referenzvideos konnten nicht geladen werden.",
				});
			}
		},
	);

	/**
	 * GET /api/v1/dgs-videos/:filename
	 * Stream a DGS reference video file from the downloaded examples directory.
	 */
	app.get(
		"/api/v1/dgs-videos/:filename",
		authMiddleware,
		videoRateLimiter,
		async (req: Request, res: Response) => {
			const { filename } = req.params;
			if (!filename) {
				return res.status(400).json({ error: "Dateiname fehlt." });
			}

			try {
				const ext = path.extname(filename).toLowerCase();
				if (!ALLOWED_CLIP_EXTENSIONS.has(ext)) {
					return res
						.status(400)
						.json({ error: "Ungültiges Videoformat." });
				}

				// Only allow simple filenames — no path separators
				if (
					filename.includes("/") ||
					filename.includes("\\") ||
					filename.includes("..")
				) {
					return res
						.status(403)
						.json({ error: "Zugriff verweigert." });
				}

				const videoPath = path.join(DGS_VIDEO_DIR, filename);
				const resolvedPath = path.resolve(videoPath);

				// Path traversal protection
				if (
					!resolvedPath.startsWith(path.resolve(DGS_VIDEO_DIR))
				) {
					return res
						.status(403)
						.json({ error: "Zugriff verweigert." });
				}

				if (!existsSync(resolvedPath)) {
					return res
						.status(404)
						.json({ error: "Video nicht gefunden." });
				}

				const stat = await fs.stat(resolvedPath);
				const mimeType =
					CLIP_MIME_MAP[ext] ?? "application/octet-stream";

				res.setHeader("Content-Type", mimeType);
				res.setHeader("Content-Length", stat.size);
				res.setHeader("Accept-Ranges", "bytes");

				// Support range requests for video seeking
				const range = req.headers.range;
				if (range) {
					const parts = range
						.replace(/bytes=/, "")
						.split("-");
					const start = parseInt(parts[0] || "0", 10);
					const end = parts[1]
						? parseInt(parts[1], 10)
						: stat.size - 1;
					if (
						start >= stat.size ||
						end >= stat.size ||
						start > end
					) {
						res.status(416).setHeader(
							"Content-Range",
							`bytes */${stat.size}`,
						);
						return res.end();
					}
					res.status(206);
					res.setHeader(
						"Content-Range",
						`bytes ${start}-${end}/${stat.size}`,
					);
					res.setHeader("Content-Length", end - start + 1);
					createReadStream(resolvedPath, { start, end }).pipe(
						res,
					);
				} else {
					createReadStream(resolvedPath).pipe(res);
				}
			} catch (error) {
				logger.error("Failed to serve DGS reference video", {
					filename,
					error:
						error instanceof Error
							? error.message
							: String(error),
				});
				return res.status(500).json({
					error: "Referenzvideo konnte nicht abgespielt werden.",
				});
			}
		},
	);
}
