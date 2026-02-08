import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { constants as fsConstants, promises as fs } from "fs";
import path from "path";
import {
	ensureUserLabelDirs,
	getUserLabelLandmarksPath,
	PROFILE_ID_PATTERN,
	SERVER_DIR,
} from "../constants/modelPaths.js";
import { getLabelMetadataEntry, loadDgsManifest } from "./labelRegistry.js";
import { queueTrainingJob } from "./trainingOrchestrator.js";

type AutoPretrainStatus = "queued" | "running" | "completed" | "failed";

export type AutoPretrainJob = {
	jobId: string;
	userId: string;
	labelId: string;
	status: AutoPretrainStatus;
	startedAt?: string;
	completedAt?: string;
	error?: string;
	trainingJobId?: string;
};

const autoPretrainJobs = new Map<string, AutoPretrainJob>();

const REPO_ROOT = path.resolve(SERVER_DIR, "..");
const DGS_VIDEO_DIR = path.join(SERVER_DIR, "data", "dgs_video_examples");
const DGS_MANIFEST_PATH = path.join(SERVER_DIR, "data", "dgs_manifest.json");
const MODELS_DIR = path.join(SERVER_DIR, "data", "models");
const FETCH_SCRIPT = path.join(REPO_ROOT, "scripts", "fetch_signdict_label.py");
const PROCESS_SCRIPT = path.join(REPO_ROOT, "scripts", "process_dgs_videos.py");
const JOB_TTL_MS = 60 * 60 * 1000;
const LABEL_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function createJobId(prefix: string): string {
	return `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

function normalizeLabelId(labelId: string): string {
	return labelId.trim().toLowerCase();
}

function normalizeSearchTerm(term: string): string {
	return term
		.toLowerCase()
		.replace(/ä/g, "ae")
		.replace(/ö/g, "oe")
		.replace(/ü/g, "ue")
		.replace(/ß/g, "ss");
}

function pruneOldJobs(): void {
	const now = Date.now();
	for (const [key, job] of autoPretrainJobs) {
		if (
			(job.status === "completed" || job.status === "failed") &&
			job.completedAt &&
			now - new Date(job.completedAt).getTime() > JOB_TTL_MS
		) {
			autoPretrainJobs.delete(key);
		}
	}
}

async function runPythonScript(args: string[]): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn("python3", args, {
			cwd: REPO_ROOT,
			env: {
				...process.env,
				PYTHONPATH: REPO_ROOT,
			},
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) => {
			reject(error);
		});
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				const error = new Error(
					`Python script failed with exit code ${code}`,
				) as Error & { stdout?: string; stderr?: string };
				error.stdout = stdout;
				error.stderr = stderr;
				reject(error);
			}
		});
	});
}

function buildLandmarkFilename(videoFile: string): string {
	const base = videoFile.endsWith(".mp4")
		? videoFile.slice(0, -4)
		: videoFile;
	return `${base}_landmarks.json`;
}

async function readManifestVideos(labelId: string): Promise<string[]> {
	const manifest = await loadDgsManifest();
	const entry = manifest?.gestures?.find(
		(g) => g.id === labelId || g.label === labelId,
	);
	return entry?.videos ?? [];
}

async function ensureVideosForLabel(
	labelId: string,
	searchTerms: string[],
): Promise<string[]> {
	if (!LABEL_ID_PATTERN.test(labelId)) {
		throw new Error("Ungültige Label-ID.");
	}
	const manifestVideos = await readManifestVideos(labelId);
	let shouldFetch = manifestVideos.length === 0;
	if (!shouldFetch) {
		try {
			const existingFiles = new Set(await fs.readdir(DGS_VIDEO_DIR));
			shouldFetch = manifestVideos.some((file) => !existingFiles.has(file));
		} catch {
			shouldFetch = true;
		}
	}

	if (shouldFetch) {
		const args = [
			FETCH_SCRIPT,
			"--label",
			labelId,
			"--search-terms",
			searchTerms.join(","),
		];
		await runPythonScript(args);
	}

	return readManifestVideos(labelId);
}

async function ensureLandmarksForLabel(labelId: string): Promise<string[]> {
	const videos = await readManifestVideos(labelId);
	if (videos.length === 0) {
		return [];
	}

	const landmarkFiles = videos.map((videoFile) =>
		buildLandmarkFilename(videoFile),
	);
	let shouldProcess = false;
	try {
		const existingFiles = new Set(await fs.readdir(DGS_VIDEO_DIR));
		shouldProcess = landmarkFiles.some((file) => !existingFiles.has(file));
	} catch {
		shouldProcess = true;
	}

	if (shouldProcess) {
		const args = [
			PROCESS_SCRIPT,
			"--videos-dir",
			DGS_VIDEO_DIR,
			"--models-dir",
			MODELS_DIR,
			"--manifest",
			DGS_MANIFEST_PATH,
			"--split-output",
			"--labels",
			labelId,
		];
		await runPythonScript(args);
	}

	return landmarkFiles.filter((file) => file.length > 0);
}

async function syncLandmarksToUser(
	userId: string,
	labelId: string,
	landmarkFiles: string[],
): Promise<void> {
	// Validate identifiers before constructing any filesystem paths
	if (!PROFILE_ID_PATTERN.test(userId)) {
		throw new Error("Ungültige Benutzer-ID.");
	}
	if (!LABEL_ID_PATTERN.test(labelId)) {
		throw new Error("Ungültige Label-ID.");
	}

	const targetDir = getUserLabelLandmarksPath(userId, labelId, "server_pretrain");
	await fs.mkdir(targetDir, { recursive: true });
	const sourceRoot = path.resolve(DGS_VIDEO_DIR);
	const targetRoot = path.resolve(targetDir);

	await Promise.all(
		landmarkFiles.map(async (landmarkFile) => {
			const safeName = path.basename(landmarkFile);
			if (safeName !== landmarkFile) {
				console.warn(
					`Skipping suspicious landmark filename: ${landmarkFile}`,
				);
				return;
			}

			const sourcePath = path.resolve(DGS_VIDEO_DIR, safeName);
			const targetPath = path.resolve(targetDir, safeName);
			if (
				!sourcePath.startsWith(`${sourceRoot}${path.sep}`) ||
				!targetPath.startsWith(`${targetRoot}${path.sep}`)
			) {
				console.warn(`Path traversal blocked for: ${landmarkFile}`);
				return;
			}
			try {
				await fs.copyFile(sourcePath, targetPath, fsConstants.COPYFILE_EXCL);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
					throw error;
				}
			}
		}),
	);
}

async function buildSearchTerms(labelId: string): Promise<string[]> {
	const metadata = await getLabelMetadataEntry(labelId);
	const terms = new Set<string>();
	terms.add(labelId);

	if (metadata?.displayName) {
		terms.add(metadata.displayName.toLowerCase());
		terms.add(normalizeSearchTerm(metadata.displayName));
	}

	terms.add(normalizeSearchTerm(labelId));
	return Array.from(terms).filter((term) => term.length > 0);
}

async function runAutoPretrainJob(
	job: AutoPretrainJob,
	triggerTraining: boolean,
): Promise<void> {
	job.status = "running";
	job.startedAt = new Date().toISOString();

	const labelId = normalizeLabelId(job.labelId);
	await ensureUserLabelDirs(job.userId, labelId);

	const searchTerms = await buildSearchTerms(labelId);
	await ensureVideosForLabel(labelId, searchTerms);
	const landmarkFiles = await ensureLandmarksForLabel(labelId);
	await syncLandmarksToUser(job.userId, labelId, landmarkFiles);

	if (triggerTraining) {
		job.trainingJobId = queueTrainingJob(job.userId);
	}

	job.status = "completed";
	job.completedAt = new Date().toISOString();
	pruneOldJobs();
}

export function queueAutoPretrainJob(params: {
	userId: string;
	labelId: string;
	triggerTraining?: boolean;
}): AutoPretrainJob {
	const { userId, labelId } = params;
	if (!PROFILE_ID_PATTERN.test(userId)) {
		throw new Error("Ungültige Benutzer-ID.");
	}

	const normalizedLabelId = normalizeLabelId(labelId);
	if (!LABEL_ID_PATTERN.test(normalizedLabelId)) {
		throw new Error("Ungültige Label-ID.");
	}

	pruneOldJobs();

	const key = `${userId}:${normalizedLabelId}`;
	const existing = autoPretrainJobs.get(key);
	if (existing && (existing.status === "queued" || existing.status === "running")) {
		return existing;
	}

	const job: AutoPretrainJob = {
		jobId: createJobId("auto_pretrain"),
		userId,
		labelId: normalizedLabelId,
		status: "queued",
	};
	autoPretrainJobs.set(key, job);

	void runAutoPretrainJob(job, params.triggerTraining ?? true).catch((error) => {
		if (error instanceof Error) {
			const details = {
				message: error.message,
				stdout: (error as Error & { stdout?: string }).stdout,
				stderr: (error as Error & { stderr?: string }).stderr,
			};
			console.error("Auto pretrain failed", details);
		} else {
			console.error("Auto pretrain failed", error);
		}
		job.status = "failed";
		job.completedAt = new Date().toISOString();
		job.error = "Auto-Pretraining fehlgeschlagen.";
		pruneOldJobs();
	});

	return job;
}

export function getAutoPretrainJob(
	userId: string,
	labelId: string,
): AutoPretrainJob | undefined {
	const key = `${userId}:${normalizeLabelId(labelId)}`;
	return autoPretrainJobs.get(key);
}
