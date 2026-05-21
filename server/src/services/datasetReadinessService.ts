import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import {
	DATA_DIR,
	SERVER_DIR,
	TRAINING_DATASETS_DIR,
} from "../constants/modelPaths.js";
import { loadTrainingManifest } from "./trainingJsonStore.js";
import {
	resolvePythonExecutable,
	withProjectPythonPath,
} from "../utils/pythonExecutable.js";

export type DatasetReadinessSummary = Record<string, unknown>;

export const DATASET_READINESS_DIR = path.join(DATA_DIR, "dataset-readiness");
const DATASET_READINESS_SCRIPT = path.join(
	SERVER_DIR,
	"src",
	"amyserver_tools",
	"evaluate_dataset_readiness.py",
);

export async function runDatasetReadinessEvaluation(
	reportDir: string = DATASET_READINESS_DIR,
): Promise<DatasetReadinessSummary> {
	await fs.mkdir(reportDir, { recursive: true });
	await fs.mkdir(TRAINING_DATASETS_DIR, { recursive: true });

	const manifestSnapshotPath = path.join(reportDir, "manifest_snapshot.json");
	const manifest = loadTrainingManifest<Record<string, unknown>>();
	await fs.writeFile(
		manifestSnapshotPath,
		JSON.stringify(manifest, null, 2),
		"utf8",
	);

	await new Promise<void>((resolve, reject) => {
		const proc = spawn(
			resolvePythonExecutable(),
			[
				DATASET_READINESS_SCRIPT,
				"--manifest",
				manifestSnapshotPath,
				"--data-dir",
				DATA_DIR,
				"--output-dir",
				reportDir,
			],
			{
				env: withProjectPythonPath(),
				stdio: ["ignore", "pipe", "pipe"],
			},
		);

		let stdout = "";
		let stderr = "";

		proc.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		proc.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		proc.on("error", reject);
		proc.on("close", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(
				new Error(
					`Dataset readiness evaluator exited with code ${code}: ${stderr || stdout}`,
				),
			);
		});
	});

	const summaryRaw = await fs.readFile(path.join(reportDir, "summary.json"), "utf8");
	return JSON.parse(summaryRaw) as DatasetReadinessSummary;
}
