import { promises as fs } from "fs";
import os from "os";
import path from "path";
import {
	runPostTrainingCadenceCycle,
} from "../src/services/postTrainingCadenceService.js";
import { TRAINING_RESTART_INTERRUPTION_REASON } from "../src/services/trainingJobState.js";

describe("postTrainingCadenceService", () => {
	it("summarizes retry-eligible interrupted jobs and retention candidates in dry-run mode", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "amy-post-training-cadence-"));
		const stateFilePath = path.join(tempDir, "training-orchestrator-jobs.json");
		const reportDir = path.join(tempDir, "reports");
		await fs.writeFile(
			stateFilePath,
			JSON.stringify({
				version: 1,
				savedAt: "2026-04-06T12:00:00.000Z",
				jobs: [
					{
						jobId: "job-completed-stale",
						userId: "11111111-1111-4111-8111-111111111111",
						status: "completed",
						completedAt: "2026-03-01T12:00:00.000Z",
						labels: [],
					},
					{
						jobId: "job-failed-retry",
						userId: "22222222-2222-4222-8222-222222222222",
						status: "failed",
						completedAt: "2026-04-05T12:00:00.000Z",
						error: TRAINING_RESTART_INTERRUPTION_REASON,
						labels: [],
					},
					{
						jobId: "job-failed-stale",
						userId: "33333333-3333-4333-8333-333333333333",
						status: "failed",
						completedAt: "2026-03-15T12:00:00.000Z",
						error: "Other failure",
						labels: [],
					},
					{
						jobId: "job-running",
						userId: "44444444-4444-4444-8444-444444444444",
						status: "running",
						startedAt: "2026-04-06T11:59:00.000Z",
						labels: [],
					},
				],
			}),
			"utf8",
		);

		const summary = await runPostTrainingCadenceCycle({
			dryRun: true,
			now: new Date("2026-04-06T12:00:00.000Z"),
			reportDir,
			retentionDays: 14,
			stateFilePath,
		});

		expect(summary.totals.totalJobs).toBe(4);
		expect(summary.totals.retryEligibleInterrupted).toBe(1);
		expect(summary.totals.retentionCandidates).toBe(2);
		expect(summary.retention.removedJobIds).toEqual([]);
		expect(summary.reconciliation.retryEligibleInterruptedJobs).toHaveLength(1);
		expect(summary.reconciliation.activeJobs).toHaveLength(1);

		const persisted = JSON.parse(await fs.readFile(stateFilePath, "utf8")) as {
			jobs: unknown[];
		};
		expect(persisted.jobs).toHaveLength(4);
		await expect(fs.readFile(path.join(reportDir, "latest.md"), "utf8")).resolves.toContain(
			"Retry-eligible interrupted jobs",
		);
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it("prunes stale completed and failed jobs while preserving retry-eligible interrupted jobs", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "amy-post-training-cadence-prune-"));
		const stateFilePath = path.join(tempDir, "training-orchestrator-jobs.json");
		const reportDir = path.join(tempDir, "reports");
		await fs.writeFile(
			stateFilePath,
			JSON.stringify({
				version: 1,
				savedAt: "2026-04-06T12:00:00.000Z",
				jobs: [
					{
						jobId: "job-completed-stale",
						userId: "11111111-1111-4111-8111-111111111111",
						status: "completed",
						completedAt: "2026-03-01T12:00:00.000Z",
						labels: [],
					},
					{
						jobId: "job-failed-retry",
						userId: "22222222-2222-4222-8222-222222222222",
						status: "failed",
						completedAt: "2026-04-05T12:00:00.000Z",
						error: TRAINING_RESTART_INTERRUPTION_REASON,
						labels: [],
					},
					{
						jobId: "job-failed-stale",
						userId: "33333333-3333-4333-8333-333333333333",
						status: "failed",
						completedAt: "2026-03-15T12:00:00.000Z",
						error: "Other failure",
						labels: [],
					},
					{
						jobId: "job-queued",
						userId: "44444444-4444-4444-8444-444444444444",
						status: "queued",
						labels: [],
					},
				],
			}),
			"utf8",
		);

		const summary = await runPostTrainingCadenceCycle({
			dryRun: false,
			now: new Date("2026-04-06T12:00:00.000Z"),
			reportDir,
			retentionDays: 14,
			stateFilePath,
		});

		expect(summary.retention.removedJobIds).toEqual([
			"job-completed-stale",
			"job-failed-stale",
		]);

		const persisted = JSON.parse(await fs.readFile(stateFilePath, "utf8")) as {
			jobs: Array<{ jobId: string }>;
		};
		expect(persisted.jobs.map((job) => job.jobId).sort()).toEqual([
			"job-failed-retry",
			"job-queued",
		]);

		await fs.rm(tempDir, { recursive: true, force: true });
	});
});
