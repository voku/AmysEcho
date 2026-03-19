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

		const { initializeDatabase, insertUserLabelSetting } = await import(
			"../src/sqliteDb.js"
		);
		await initializeDatabase(dbPath);
		insertUserLabelSetting({
			id: randomUUID(),
			userId,
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
});
