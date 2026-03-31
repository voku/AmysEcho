import { promises as fs } from "fs";
import os from "os";
import path from "path";

describe("resetTrainingData", () => {
	let tempDir: string;
	let dbPath: string;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "amy-reset-training-"));
		dbPath = path.join(tempDir, "db.json");
		process.env.AMY_ECHO_DATA_DIR = path.join(tempDir, "data");
		jest.resetModules();
	});

	afterEach(async () => {
		delete process.env.AMY_ECHO_DATA_DIR;
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it("clears training artifacts while preserving custom signs and global model", async () => {
		const { loadDatabase } = await import("../src/db.js");
		const { insertUserLabelSetting, insertCorrection, insertNegativeSample } =
			await import("../src/sqliteDb.js");
		const { resetTrainingData } = await import(
			"../src/services/trainingResetService.js"
		);
		const { saveTrainingManifest, saveDgsSamples, saveCustomSigns, saveTrainingQualityLog, loadTrainingManifest, loadDgsSamples, loadCustomSigns, loadTrainingQualityLog } =
			await import("../src/services/trainingJsonStore.js");
		const {
			TRAINING_UPLOADS_DIR,
			TRAINING_DATASETS_DIR,
			MLP_MODELS_DIR,
			TRAINED_MLP_GLOBAL_DIR,
			USER_TRAINING_DATA_DIR,
		} = await import("../src/constants/modelPaths.js");

		await loadDatabase(dbPath);
		insertUserLabelSetting({
			id: "setting-1",
			userId: "11111111-1111-4111-8111-111111111111",
			labelId: "hilfe",
			mode: "user_train",
			enabled: true,
			updatedAt: "2026-03-18T00:00:00.000Z",
			lastTrainedAt: "2026-03-18T12:00:00.000Z",
		});
		insertCorrection({
			id: "corr-1",
			predictedSign: "hallo",
			actualSign: "hilfe",
			confidence: 0.4,
			timestamp: Date.now(),
			isSynced: true,
			profileId: "11111111-1111-4111-8111-111111111111",
		});
		insertNegativeSample({
			id: "neg-1",
			sign: "falsch",
			timestamp: Date.now(),
		});

		saveTrainingManifest({ entries: [{ id: "bundle-1", profileId: "11111111-1111-4111-8111-111111111111", label: "hilfe", storage: { directory: "training_uploads/11111111-1111-4111-8111-111111111111/bundle-1", files: ["landmarks.json"] } }] });
		saveDgsSamples({ samples: [{ id: "sample-1", profileId: "11111111-1111-4111-8111-111111111111" }] });
		saveCustomSigns({ signs: [{ id: "custom-1", profileId: "11111111-1111-4111-8111-111111111111" }] });
		saveTrainingQualityLog({ entries: [{ bundleId: "bundle-1" }] });
		await fs.mkdir(TRAINING_DATASETS_DIR, { recursive: true });
		await fs.writeFile(
			path.join(TRAINING_DATASETS_DIR, "ingestion_metrics.json"),
			JSON.stringify({ totals: { uploads: 1 }, profiles: {} }),
		);
		await fs.mkdir(path.join(TRAINING_UPLOADS_DIR, "11111111-1111-4111-8111-111111111111"), {
			recursive: true,
		});
		await fs.writeFile(
			path.join(
				TRAINING_UPLOADS_DIR,
				"11111111-1111-4111-8111-111111111111",
				"bundle.zip",
			),
			"zip",
		);
		await fs.mkdir(path.join(USER_TRAINING_DATA_DIR, "11111111-1111-4111-8111-111111111111", "models"), {
			recursive: true,
		});
		await fs.writeFile(
			path.join(
				USER_TRAINING_DATA_DIR,
				"11111111-1111-4111-8111-111111111111",
				"models",
				"report_123.json",
			),
			"{}",
		);
		await fs.mkdir(path.join(MLP_MODELS_DIR, "11111111-1111-4111-8111-111111111111"), {
			recursive: true,
		});
		await fs.writeFile(
			path.join(
				MLP_MODELS_DIR,
				"11111111-1111-4111-8111-111111111111",
				"amy_model.npz",
			),
			"model",
		);
		await fs.mkdir(TRAINED_MLP_GLOBAL_DIR, { recursive: true });
		await fs.writeFile(path.join(TRAINED_MLP_GLOBAL_DIR, "amy_model.npz"), "global");

		const summary = await resetTrainingData({
			dbPath,
			preserveGlobalModel: true,
		});

		const manifest = loadTrainingManifest();
		const dgsSamples = loadDgsSamples();
		const customSigns = loadCustomSigns();
		const qualityLog = loadTrainingQualityLog();

		expect(summary.trainingManifestEntriesCleared).toBe(1);
		expect(summary.dgsSamplesCleared).toBe(1);
		expect(summary.customSignsPreserved).toBe(1);
		expect(summary.trainingQualityLogEntriesCleared).toBe(1);
		expect(summary.modelsRemoved).toEqual(["11111111-1111-4111-8111-111111111111"]);
		expect(summary.sqlite.correctionsDeleted).toBe(1);
		expect(summary.sqlite.negativeSamplesDeleted).toBe(1);
		expect(summary.sqlite.labelSettingsReset).toBe(1);
		expect(manifest).toEqual({ entries: [] });
		expect(dgsSamples).toEqual({ samples: [] });
		expect(customSigns).toEqual({ signs: [{ id: "custom-1", profileId: "11111111-1111-4111-8111-111111111111" }] });
		expect(qualityLog).toEqual({ entries: [] });
		await expect(
			fs.access(path.join(TRAINING_DATASETS_DIR, "ingestion_metrics.json")),
		).rejects.toMatchObject({ code: "ENOENT" });
		expect(
			await fs.readdir(TRAINING_UPLOADS_DIR),
		).toEqual([]);
		expect(
			await fs.readdir(USER_TRAINING_DATA_DIR),
		).toEqual([]);
		await expect(
			fs.access(
				path.join(
					MLP_MODELS_DIR,
					"11111111-1111-4111-8111-111111111111",
				),
			),
		).rejects.toMatchObject({ code: "ENOENT" });
		await expect(fs.access(path.join(TRAINED_MLP_GLOBAL_DIR, "amy_model.npz"))).resolves.toBeUndefined();
	});

	it("supports dry-run summaries without deleting artifacts", async () => {
		const { loadDatabase } = await import("../src/db.js");
		const { resetTrainingData } = await import(
			"../src/services/trainingResetService.js"
		);
		const { saveTrainingManifest, loadTrainingManifest } = await import("../src/services/trainingJsonStore.js");

		await loadDatabase(dbPath);
		saveTrainingManifest({ entries: [{ id: "bundle-1", label: "hilfe", storage: { directory: "training_uploads/test/bundle-1", files: ["landmarks.json"] } }] });

		const summary = await resetTrainingData({
			dbPath,
			dryRun: true,
		});

		expect(summary.dryRun).toBe(true);
		expect(summary.trainingManifestEntriesCleared).toBe(1);
		expect(summary.sqlite.correctionsDeleted).toBe(0);
		expect(loadTrainingManifest()).toEqual({
			entries: [{ id: "bundle-1", label: "hilfe", storage: { directory: "training_uploads/test/bundle-1", files: ["landmarks.json"] } }],
		});
	});
});
