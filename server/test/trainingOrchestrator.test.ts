import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

describe("trainingOrchestrator", () => {
	const originalDataDir = process.env.AMY_ECHO_DATA_DIR;

	afterEach(async () => {
		jest.resetModules();
		if (originalDataDir) {
			process.env.AMY_ECHO_DATA_DIR = originalDataDir;
		} else {
			delete process.env.AMY_ECHO_DATA_DIR;
		}

		const { closeDatabase } = await import("../src/sqliteDb.js");
		closeDatabase();
	});

	it("ignores legacy upload folders when gathering user_train data", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "amy-training-orchestrator-"));
		process.env.AMY_ECHO_DATA_DIR = tempDir;

		const dbPath = path.join(tempDir, "training.sqlite");
		const userId = randomUUID();
		const labelId = "essen";
		const legacyLandmarksPath = path.join(
			tempDir,
			"uploads",
			userId,
			labelId,
			"legacy_landmarks.json",
		);

		await fs.mkdir(path.dirname(legacyLandmarksPath), { recursive: true });
		await fs.writeFile(legacyLandmarksPath, JSON.stringify({ frames: [] }));

		const { initializeDatabase, insertProfileLabelSetting } = await import(
			"../src/sqliteDb.js"
		);
		await initializeDatabase(dbPath);
		insertProfileLabelSetting({
			id: randomUUID(),
			profileId: userId,
			labelId,
			mode: "user_train",
			enabled: true,
			updatedAt: new Date().toISOString(),
		});

		const { gatherTrainingData } = await import(
			"../src/services/trainingOrchestrator.js"
		);
		const trainingData = await gatherTrainingData(userId);

		expect(trainingData).toEqual([]);

		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it("recovers queued/running jobs as failed after restart", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "amy-training-orchestrator-recovery-"));
		process.env.AMY_ECHO_DATA_DIR = tempDir;
		const userId = randomUUID();
		const now = new Date().toISOString();

		await fs.writeFile(
			path.join(tempDir, "training-orchestrator-jobs.json"),
			JSON.stringify({
				version: 1,
				savedAt: now,
				jobs: [
					{
						jobId: "job-running",
						userId,
						status: "running",
						startedAt: now,
						labels: [],
					},
					{
						jobId: "job-queued",
						userId,
						status: "queued",
						labels: [],
					},
					{
						jobId: "job-done",
						userId,
						status: "completed",
						completedAt: now,
						labels: [],
					},
				],
			}),
		);

		const { getTrainingJobStatus } = await import(
			"../src/services/trainingOrchestrator.js"
		);

		const runningRecovered = getTrainingJobStatus("job-running");
		const queuedRecovered = getTrainingJobStatus("job-queued");
		const completed = getTrainingJobStatus("job-done");

		expect(runningRecovered?.status).toBe("failed");
		expect(runningRecovered?.error).toContain("Server-Neustart");
		expect(queuedRecovered?.status).toBe("failed");
		expect(queuedRecovered?.error).toContain("Server-Neustart");
		expect(completed?.status).toBe("completed");

		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it("deduplicates concurrent queue requests for the same profile", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "amy-training-orchestrator-dedupe-"));
		process.env.AMY_ECHO_DATA_DIR = tempDir;
		const userId = randomUUID();

		const { queueTrainingJob } = await import(
			"../src/services/trainingOrchestrator.js"
		);

		const firstJobId = queueTrainingJob(userId);
		const secondJobId = queueTrainingJob(userId);

		expect(secondJobId).toBe(firstJobId);

		const persistedPath = path.join(tempDir, "training-orchestrator-jobs.json");
		await new Promise((resolve) => setTimeout(resolve, 20));
		const persistedRaw = await fs.readFile(persistedPath, "utf8");
		const persisted = JSON.parse(persistedRaw) as {
			jobs?: Array<{ userId?: string; status?: string }>;
		};
		const jobsForUser = (persisted.jobs ?? []).filter((job) => job.userId === userId);
		expect(jobsForUser.length).toBe(1);

		await fs.rm(tempDir, { recursive: true, force: true });
	});
});
