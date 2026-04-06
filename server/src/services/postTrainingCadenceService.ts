import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "../constants/modelPaths.js";
import type { TrainingJobStatus } from "./trainingOrchestrator.js";
import {
	TRAINING_ORCHESTRATOR_JOB_STATE_FILE,
	TRAINING_RESTART_INTERRUPTION_REASON,
} from "./trainingJobState.js";

type PersistedTrainingJobsPayload = {
	version: number;
	savedAt: string;
	jobs: TrainingJobStatus[];
};

export type PostTrainingCadenceJobExcerpt = {
	jobId: string;
	userId: string;
	status: TrainingJobStatus["status"];
	startedAt?: string;
	completedAt?: string;
	error?: string;
};

export type PostTrainingCadenceSummary = {
	generatedAt: string;
	dryRun: boolean;
	retentionDays: number;
	reportDir: string;
	sourceStateFile: string;
	totals: {
		totalJobs: number;
		queued: number;
		running: number;
		completed: number;
		failed: number;
		retryEligibleInterrupted: number;
		retentionCandidates: number;
	};
	reconciliation: {
		activeJobs: PostTrainingCadenceJobExcerpt[];
		retryEligibleInterruptedJobs: PostTrainingCadenceJobExcerpt[];
		notes: string[];
	};
	retention: {
		cutoffAt: string;
		candidateJobs: PostTrainingCadenceJobExcerpt[];
		removedJobIds: string[];
	};
	outputs: {
		jsonPath: string;
		markdownPath: string;
		latestJsonPath: string;
		latestMarkdownPath: string;
	};
};

export type PostTrainingCadenceOptions = {
	dryRun?: boolean;
	now?: Date;
	reportDir?: string;
	retentionDays?: number;
	stateFilePath?: string;
};

export const POST_TRAINING_CADENCE_DIR = path.join(
	DATA_DIR,
	"post-training-cadence",
);

function toExcerpt(job: TrainingJobStatus): PostTrainingCadenceJobExcerpt {
	return {
		jobId: job.jobId,
		userId: job.userId,
		status: job.status,
		startedAt: job.startedAt,
		completedAt: job.completedAt,
		error: job.error,
	};
}

function jobTimestamp(job: TrainingJobStatus): number | null {
	const candidate = job.completedAt ?? job.startedAt;
	if (!candidate) {
		return null;
	}
	const parsed = Date.parse(candidate);
	return Number.isFinite(parsed) ? parsed : null;
}

function isRetryEligibleInterrupted(job: TrainingJobStatus): boolean {
	return (
		job.status === "failed" &&
		typeof job.error === "string" &&
		job.error.includes(TRAINING_RESTART_INTERRUPTION_REASON)
	);
}

function buildMarkdown(summary: PostTrainingCadenceSummary): string {
	const lines = [
		"# Post-training cadence summary",
		"",
		`- Generated at: \`${summary.generatedAt}\``,
		`- Dry run: \`${summary.dryRun ? "yes" : "no"}\``,
		`- Retention days: \`${summary.retentionDays}\``,
		`- Source state file: \`${summary.sourceStateFile}\``,
		"",
		"## Totals",
		"",
		"| Metric | Value |",
		"| --- | ---: |",
		`| Total jobs | ${summary.totals.totalJobs} |`,
		`| Queued | ${summary.totals.queued} |`,
		`| Running | ${summary.totals.running} |`,
		`| Completed | ${summary.totals.completed} |`,
		`| Failed | ${summary.totals.failed} |`,
		`| Retry-eligible interrupted | ${summary.totals.retryEligibleInterrupted} |`,
		`| Retention candidates | ${summary.totals.retentionCandidates} |`,
		"",
		"## Reconciliation notes",
		"",
	];

	if (summary.reconciliation.notes.length === 0) {
		lines.push("- No reconciliation notes.");
	} else {
		for (const note of summary.reconciliation.notes) {
			lines.push(`- ${note}`);
		}
	}

	lines.push("", "## Retry-eligible interrupted jobs", "");
	if (summary.reconciliation.retryEligibleInterruptedJobs.length === 0) {
		lines.push("- None.");
	} else {
		lines.push(
			"| Job ID | User ID | Completed at | Error |",
			"| --- | --- | --- | --- |",
		);
		for (const job of summary.reconciliation.retryEligibleInterruptedJobs) {
			lines.push(
				`| ${job.jobId} | ${job.userId} | ${job.completedAt ?? "-"} | ${job.error ?? "-"} |`,
			);
		}
	}

	lines.push("", "## Retention candidates", "");
	if (summary.retention.candidateJobs.length === 0) {
		lines.push("- None.");
	} else {
		lines.push(
			"| Job ID | User ID | Status | Completed at |",
			"| --- | --- | --- | --- |",
		);
		for (const job of summary.retention.candidateJobs) {
			lines.push(
				`| ${job.jobId} | ${job.userId} | ${job.status} | ${job.completedAt ?? job.startedAt ?? "-"} |`,
			);
		}
	}

	if (summary.retention.removedJobIds.length > 0) {
		lines.push("", "## Removed job IDs", "");
		for (const jobId of summary.retention.removedJobIds) {
			lines.push(`- ${jobId}`);
		}
	}

	return `${lines.join("\n")}\n`;
}

async function loadPersistedJobs(
	stateFilePath: string,
	nowIso: string,
): Promise<PersistedTrainingJobsPayload> {
	try {
		const raw = await fs.readFile(stateFilePath, "utf8");
		const parsed = JSON.parse(raw) as {
			version?: unknown;
			savedAt?: unknown;
			jobs?: unknown;
		};
		return {
			version: typeof parsed.version === "number" ? parsed.version : 1,
			savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : nowIso,
			jobs: Array.isArray(parsed.jobs)
				? parsed.jobs.filter(
						(job): job is TrainingJobStatus =>
							!!job &&
							typeof job === "object" &&
							typeof (job as TrainingJobStatus).jobId === "string" &&
							typeof (job as TrainingJobStatus).userId === "string" &&
							typeof (job as TrainingJobStatus).status === "string",
				  )
				: [],
		};
	} catch (error) {
		const code = (error as NodeJS.ErrnoException | undefined)?.code;
		if (code === "ENOENT") {
			return {
				version: 1,
				savedAt: nowIso,
				jobs: [],
			};
		}
		throw error;
	}
}

async function writeSummaryFiles(
	reportDir: string,
	now: Date,
	summary: PostTrainingCadenceSummary,
): Promise<PostTrainingCadenceSummary["outputs"]> {
	await fs.mkdir(reportDir, { recursive: true });
	const stamp = now.toISOString().replace(/[:]/g, "-");
	const jsonPath = path.join(reportDir, `post-training-cadence-${stamp}.json`);
	const markdownPath = path.join(reportDir, `post-training-cadence-${stamp}.md`);
	const latestJsonPath = path.join(reportDir, "latest.json");
	const latestMarkdownPath = path.join(reportDir, "latest.md");
	const outputs = {
		jsonPath,
		markdownPath,
		latestJsonPath,
		latestMarkdownPath,
	};
	const materializedSummary: PostTrainingCadenceSummary = {
		...summary,
		outputs,
	};
	const markdown = buildMarkdown(materializedSummary);

	await fs.writeFile(jsonPath, JSON.stringify(materializedSummary, null, 2), "utf8");
	await fs.writeFile(markdownPath, markdown, "utf8");
	await fs.writeFile(latestJsonPath, JSON.stringify(materializedSummary, null, 2), "utf8");
	await fs.writeFile(latestMarkdownPath, markdown, "utf8");

	return outputs;
}

export async function runPostTrainingCadenceCycle(
	options: PostTrainingCadenceOptions = {},
): Promise<PostTrainingCadenceSummary> {
	const now = options.now ?? new Date();
	const nowIso = now.toISOString();
	const dryRun = options.dryRun ?? false;
	const retentionDays = options.retentionDays ?? 14;
	const stateFilePath =
		options.stateFilePath ?? TRAINING_ORCHESTRATOR_JOB_STATE_FILE;
	const reportDir = options.reportDir ?? POST_TRAINING_CADENCE_DIR;
	const retentionCutoffMs = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
	const payload = await loadPersistedJobs(stateFilePath, nowIso);
	const retryEligibleInterruptedJobs = payload.jobs.filter(isRetryEligibleInterrupted);
	const activeJobs = payload.jobs.filter(
		(job) => job.status === "queued" || job.status === "running",
	);
	const retentionCandidateJobs = payload.jobs.filter((job) => {
		if (job.status !== "completed" && job.status !== "failed") {
			return false;
		}
		if (isRetryEligibleInterrupted(job)) {
			return false;
		}
		const timestamp = jobTimestamp(job);
		return timestamp !== null && timestamp < retentionCutoffMs;
	});

	const removedJobIds: string[] = [];
	if (!dryRun && retentionCandidateJobs.length > 0) {
		const removableIds = new Set(retentionCandidateJobs.map((job) => job.jobId));
		const nextPayload: PersistedTrainingJobsPayload = {
			version: payload.version,
			savedAt: nowIso,
			jobs: payload.jobs.filter((job) => !removableIds.has(job.jobId)),
		};
		await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
		await fs.writeFile(stateFilePath, JSON.stringify(nextPayload, null, 2), "utf8");
		removedJobIds.push(...retentionCandidateJobs.map((job) => job.jobId));
	}

	const summary: PostTrainingCadenceSummary = {
		generatedAt: nowIso,
		dryRun,
		retentionDays,
		reportDir,
		sourceStateFile: stateFilePath,
		totals: {
			totalJobs: payload.jobs.length,
			queued: payload.jobs.filter((job) => job.status === "queued").length,
			running: payload.jobs.filter((job) => job.status === "running").length,
			completed: payload.jobs.filter((job) => job.status === "completed").length,
			failed: payload.jobs.filter((job) => job.status === "failed").length,
			retryEligibleInterrupted: retryEligibleInterruptedJobs.length,
			retentionCandidates: retentionCandidateJobs.length,
		},
		reconciliation: {
			activeJobs: activeJobs.map(toExcerpt),
			retryEligibleInterruptedJobs: retryEligibleInterruptedJobs.map(toExcerpt),
			notes: [
				retryEligibleInterruptedJobs.length > 0
					? `${retryEligibleInterruptedJobs.length} restart-interrupted job(s) remain retry-eligible and must not be silently pruned.`
					: "No restart-interrupted retry candidates found in orchestrator state.",
				activeJobs.length > 0
					? `${activeJobs.length} active job(s) remain in queued/running state and were excluded from retention decisions.`
					: "No active queued/running jobs in current cadence snapshot.",
			],
		},
		retention: {
			cutoffAt: new Date(retentionCutoffMs).toISOString(),
			candidateJobs: retentionCandidateJobs.map(toExcerpt),
			removedJobIds,
		},
		outputs: {
			jsonPath: "",
			markdownPath: "",
			latestJsonPath: "",
			latestMarkdownPath: "",
		},
	};

	summary.outputs = await writeSummaryFiles(reportDir, now, summary);
	return summary;
}

export async function readLatestPostTrainingCadenceSummary(
	reportDir: string = POST_TRAINING_CADENCE_DIR,
): Promise<PostTrainingCadenceSummary | null> {
	try {
		const raw = await fs.readFile(path.join(reportDir, "latest.json"), "utf8");
		return JSON.parse(raw) as PostTrainingCadenceSummary;
	} catch (error) {
		const code = (error as NodeJS.ErrnoException | undefined)?.code;
		if (code === "ENOENT") {
			return null;
		}
		throw error;
	}
}
