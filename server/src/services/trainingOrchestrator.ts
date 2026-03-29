/**
 * Training Orchestrator Service
 *
 * Amy First: Orchestrates per-user model training using configured label settings.
 * Each child can have their own personalized model with:
 * - server_pretrain labels: trained on curated internet DGS examples
 * - user_train labels: trained on caregiver-recorded samples
 *
 * This service ensures training uses only enabled labels with correct data sources.
 */

import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import config from "../config/index.js";
import {
	getUserLabelLandmarksPath,
	PROFILE_ID_PATTERN,
	DATA_DIR,
	MLP_MODELS_DIR,
} from "../constants/modelPaths.js";
import {
	getUserLabelSettingsByUserId,
	updateUserLabelLastTrained,
} from "../sqliteDb.js";
import type { LabelTrainingMode } from "../types.js";
import {
	resolvePythonExecutable,
	withProjectPythonPath,
} from "../utils/pythonExecutable.js";

/**
 * Training job status
 */
export interface TrainingJobStatus {
	jobId: string;
	userId: string;
	status: "queued" | "running" | "completed" | "failed";
	startedAt?: string;
	completedAt?: string;
	error?: string;
	/** Labels included in training */
	labels: {
		labelId: string;
		mode: LabelTrainingMode;
		sampleCount: number;
	}[];
	/** Training metrics from the report */
	metrics?: {
		accuracy?: number;
		loss?: number;
		samples?: number;
		epochs?: number;
	};
}

/**
 * Training data source for a single label
 */
export interface LabelTrainingData {
	labelId: string;
	mode: LabelTrainingMode;
	landmarkPaths: string[];
	sampleCount: number;
}

// In-memory job queue (simple implementation)
const jobQueue: Map<string, TrainingJobStatus> = new Map();

// Lock set to prevent TOCTOU race condition when queueing jobs
// Tracks users with in-flight job creation
const jobCreationLock: Set<string> = new Set();

/**
 * Get training data paths for a user's enabled labels
 * Respects the mode setting for each label
 */
export async function gatherTrainingData(
	userId: string,
): Promise<LabelTrainingData[]> {
	if (!PROFILE_ID_PATTERN.test(userId)) {
		throw new Error("Ungültige Benutzer-ID");
	}

	const settings = getUserLabelSettingsByUserId(userId);
	const enabledSettings = settings.filter((s) => s.enabled);

	const trainingData: LabelTrainingData[] = [];

	for (const setting of enabledSettings) {
		const data = await gatherLabelTrainingData(
			userId,
			setting.labelId,
			setting.mode,
		);
		if (data.sampleCount > 0) {
			trainingData.push(data);
		}
	}

	return trainingData;
}

/**
 * Gather training data for a single label
 */
async function gatherLabelTrainingData(
	userId: string,
	labelId: string,
	mode: LabelTrainingMode,
): Promise<LabelTrainingData> {
	const landmarkPaths: string[] = [];

	if (mode === "server_pretrain") {
		// For server_pretrain, look for pre-extracted landmarks
		// from the global DGS video examples
		const serverLandmarksPath = getUserLabelLandmarksPath(
			userId,
			labelId,
			"server_pretrain",
		);
		try {
			const files = await fs.readdir(serverLandmarksPath);
			for (const file of files) {
				if (file.endsWith(".json")) {
					landmarkPaths.push(path.join(serverLandmarksPath, file));
				}
			}
		} catch {
			// Directory doesn't exist
		}
	} else {
		// For user_train, only read the canonical user_train landmarks directory
		const userLandmarksPath = getUserLabelLandmarksPath(
			userId,
			labelId,
			"user_train",
		);
		try {
			const files = await fs.readdir(userLandmarksPath);
			for (const file of files) {
				if (file.endsWith(".json")) {
					landmarkPaths.push(path.join(userLandmarksPath, file));
				}
			}
		} catch {
			// Directory doesn't exist
		}
	}

	return {
		labelId,
		mode,
		landmarkPaths,
		sampleCount: landmarkPaths.length,
	};
}

/**
 * Queue a training job for a user
 * Returns the job ID for status polling
 * Uses locking to prevent TOCTOU race conditions
 */
export function queueTrainingJob(userId: string): string {
	if (!PROFILE_ID_PATTERN.test(userId)) {
		throw new Error("Ungültige Benutzer-ID");
	}

	// Acquire lock to prevent TOCTOU race condition
	// If another request is currently creating a job for this user, wait
	if (jobCreationLock.has(userId)) {
		// Another request is creating a job - find and return the pending job
		const pendingJob = Array.from(jobQueue.values()).find(
			(job) =>
				job.userId === userId &&
				(job.status === "queued" || job.status === "running"),
		);
		if (pendingJob) {
			return pendingJob.jobId;
		}
		// Lock exists but no job found - should not happen, but handle gracefully
		throw new Error("Training wird bereits vorbereitet. Bitte warten.");
	}

	// Set lock before checking for existing jobs
	jobCreationLock.add(userId);

	try {
		// Check if there's already a pending/running job for this user
		const existingJob = Array.from(jobQueue.values()).find(
			(job) =>
				job.userId === userId &&
				(job.status === "queued" || job.status === "running"),
		);
		if (existingJob) {
			return existingJob.jobId;
		}

		// Use UUID with timestamp prefix for uniqueness and readability
		const jobId = `train_${Date.now()}_${randomUUID().slice(0, 8)}`;
		const job: TrainingJobStatus = {
			jobId,
			userId,
			status: "queued",
			labels: [],
		};

		jobQueue.set(jobId, job);

		// Start the job asynchronously
		void startTrainingJob(jobId).catch((error) => {
			const job = jobQueue.get(jobId);
			if (job) {
				job.status = "failed";
				job.error = error instanceof Error ? error.message : String(error);
				job.completedAt = new Date().toISOString();
			}
		});

		return jobId;
	} finally {
		// Always release the lock
		jobCreationLock.delete(userId);
	}
}

/**
 * Get training job status
 */
export function getTrainingJobStatus(
	jobId: string,
): TrainingJobStatus | undefined {
	return jobQueue.get(jobId);
}

/**
 * Get all training jobs for a user
 */
export function getUserTrainingJobs(userId: string): TrainingJobStatus[] {
	return Array.from(jobQueue.values()).filter((job) => job.userId === userId);
}

/**
 * Start a training job
 */
async function startTrainingJob(jobId: string): Promise<void> {
	const job = jobQueue.get(jobId);
	if (!job) {
		throw new Error("Job nicht gefunden");
	}

	job.status = "running";
	job.startedAt = new Date().toISOString();

	try {
		// Gather training data respecting user settings
		const trainingData = await gatherTrainingData(job.userId);

		if (trainingData.length === 0) {
			throw new Error("Keine Trainingsdaten gefunden");
		}

		// Update job with label info
		job.labels = trainingData.map((d) => ({
			labelId: d.labelId,
			mode: d.mode,
			sampleCount: d.sampleCount,
		}));

		const entries = trainingData.flatMap((d) =>
			d.landmarkPaths
				.map((landmarkPath) => {
					const relativePath = path.relative(DATA_DIR, landmarkPath);
					if (
						relativePath.startsWith("..") ||
						path.isAbsolute(relativePath)
					) {
						return null;
					}
					return {
						label: d.labelId,
						profileId: job.userId,
						storage: {
							directory: path.dirname(relativePath),
							files: [path.basename(relativePath)],
						},
						metadata: {
							source: d.mode,
						},
					};
				})
				.filter((entry): entry is NonNullable<typeof entry> => entry !== null),
		);

		if (entries.length === 0) {
			throw new Error("Keine Trainingsdaten gefunden");
		}

		const manifest = {
			version: "1.0",
			entries,
			generatedAt: new Date().toISOString(),
			jobId,
		};

		// Write manifest to temp file
		const manifestPath = path.join(
			os.tmpdir(),
			`training_manifest_${jobId}.json`,
		);
		await fs.mkdir(path.dirname(manifestPath), { recursive: true });
		await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

		// Run training script (if configured)
		if (config.mlpScript) {
			await runTrainingScript(manifestPath, job.userId);
		}

		// Update job status
		job.status = "completed";
		job.completedAt = new Date().toISOString();

		// Update lastTrainedAt for all labels in this job
		const trainedAt = job.completedAt;
		for (const label of job.labels) {
			updateUserLabelLastTrained(job.userId, label.labelId, trainedAt);
		}

		// Clean up manifest file
		await fs.unlink(manifestPath).catch(() => {});
	} catch (error) {
		job.status = "failed";
		job.error = error instanceof Error ? error.message : String(error);
		job.completedAt = new Date().toISOString();
		throw error;
	}
}

/**
 * Run the Python training script
 */
async function runTrainingScript(
	manifestPath: string,
	_userId: string,
): Promise<void> {
	const outputDir = MLP_MODELS_DIR;

	// Ensure model directory exists
	await fs.mkdir(outputDir, { recursive: true });

	return new Promise((resolve, reject) => {
		const pythonBin = resolvePythonExecutable();
		const child = spawn(
			pythonBin,
			[
				config.mlpScript,
				"--manifest",
				manifestPath,
				"--data-dir",
				DATA_DIR,
				"--output-dir",
				outputDir,
			],
			{
				env: withProjectPythonPath(),
				stdio: ["ignore", "pipe", "pipe"],
			},
		);

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (data) => {
			stdout += data.toString();
		});

		child.stderr.on("data", (data) => {
			stderr += data.toString();
		});

		child.on("error", (err) => {
			reject(err);
		});

		child.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(
					new Error(
						`Training-Skript beendet mit Code ${code}: ${stderr || stdout}`,
					),
				);
			}
		});
	});
}

/**
 * Get a summary of training readiness for a user
 */
export async function getTrainingSummary(userId: string): Promise<{
	totalLabels: number;
	enabledLabels: number;
	serverPretrainLabels: number;
	userTrainLabels: number;
	labelsWithData: number;
	readyForTraining: boolean;
	activeJob?: TrainingJobStatus;
}> {
	if (!PROFILE_ID_PATTERN.test(userId)) {
		throw new Error("Ungültige Benutzer-ID");
	}

	const settings = getUserLabelSettingsByUserId(userId);
	const enabledSettings = settings.filter((s) => s.enabled);
	const trainingData = await gatherTrainingData(userId);

	const activeJob = Array.from(jobQueue.values()).find(
		(job) =>
			job.userId === userId &&
			(job.status === "queued" || job.status === "running"),
	);

	return {
		totalLabels: settings.length,
		enabledLabels: enabledSettings.length,
		serverPretrainLabels: enabledSettings.filter(
			(s) => s.mode === "server_pretrain",
		).length,
		userTrainLabels: enabledSettings.filter((s) => s.mode === "user_train")
			.length,
		labelsWithData: trainingData.length,
		readyForTraining: trainingData.length > 0 && !activeJob,
		activeJob,
	};
}
