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
	getMlpModelPath,
	getUserLabelLandmarksPath,
	PROFILE_ID_PATTERN,
	TRAINING_UPLOADS_DIR,
} from "../constants/modelPaths.js";
import {
	getUserLabelSettingsByUserId,
	updateUserLabelLastTrained,
} from "../sqliteDb.js";
import type { LabelTrainingMode } from "../types.js";

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
		// For user_train, look in the user's upload directory
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
			// Directory doesn't exist - try legacy upload path
		}

		// Also check legacy upload path for backward compatibility
		const legacyPath = path.join(TRAINING_UPLOADS_DIR, userId, labelId);
		try {
			const entries = await fs.readdir(legacyPath, { recursive: true });
			for (const entry of entries) {
				if (
					typeof entry === "string" &&
					!entry.includes("..") && // Prevent path traversal
					(entry.endsWith("landmarks.json") ||
						entry.endsWith("_landmarks.json"))
				) {
					landmarkPaths.push(path.join(legacyPath, entry));
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
 */
export function queueTrainingJob(userId: string): string {
	if (!PROFILE_ID_PATTERN.test(userId)) {
		throw new Error("Ungültige Benutzer-ID");
	}

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

		// Create training manifest for this job
		const manifest = {
			userId: job.userId,
			jobId,
			createdAt: new Date().toISOString(),
			labels: trainingData.map((d) => ({
				labelId: d.labelId,
				mode: d.mode,
				landmarkPaths: d.landmarkPaths,
			})),
		};

		// Write manifest to temp file
		const manifestPath = path.join(
			os.tmpdir(),
			`training_manifest_${jobId}.json`,
		);
		await fs.mkdir(path.dirname(manifestPath), { recursive: true });
		await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

		// Run training script (if configured)
		if (config.trainScript) {
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
	userId: string,
): Promise<void> {
	const modelPath = getMlpModelPath(userId);

	// Ensure model directory exists
	await fs.mkdir(path.dirname(modelPath), { recursive: true });

	return new Promise((resolve, reject) => {
		const child = spawn(
			"python3",
			[
				config.trainScript,
				"--manifest",
				manifestPath,
				"--output",
				modelPath,
				"--profile",
				userId,
			],
			{
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
