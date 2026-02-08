import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
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
		let stderr = "";
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
				reject(
					new Error(
						stderr || `Python script failed with exit code ${code}`,
					),
				);
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
	const manifestVideos = await readManifestVideos(labelId);
	const missingVideos = await Promise.all(
		manifestVideos.map(async (file) => {
			try {
				await fs.access(path.join(DGS_VIDEO_DIR, file));
				return null;
			} catch {
				return file;
			}
		}),
	);
	const hasMissingVideos = missingVideos.some(Boolean);

	if (manifestVideos.length === 0 || hasMissingVideos) {
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

	const missingLandmarks = await Promise.all(
		videos.map(async (videoFile) => {
			const landmarkFile = buildLandmarkFilename(videoFile);
			try {
				await fs.access(path.join(DGS_VIDEO_DIR, landmarkFile));
				return null;
			} catch {
				return landmarkFile;
			}
		}),
	);

	if (missingLandmarks.some(Boolean)) {
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

	return videos
		.map((videoFile) => buildLandmarkFilename(videoFile))
		.filter((file) => file.length > 0);
}

async function syncLandmarksToUser(
	userId: string,
	labelId: string,
	landmarkFiles: string[],
): Promise<void> {
	const targetDir = getUserLabelLandmarksPath(userId, labelId, "server_pretrain");
	await fs.mkdir(targetDir, { recursive: true });

	await Promise.all(
		landmarkFiles.map(async (landmarkFile) => {
			const sourcePath = path.join(DGS_VIDEO_DIR, landmarkFile);
			const targetPath = path.join(targetDir, landmarkFile);
			try {
				await fs.access(targetPath);
			} catch {
				await fs.copyFile(sourcePath, targetPath);
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
		job.status = "failed";
		job.completedAt = new Date().toISOString();
		job.error = error instanceof Error ? error.message : String(error);
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
