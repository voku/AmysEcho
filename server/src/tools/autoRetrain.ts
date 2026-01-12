import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import config from "../config/index.js";
import { loadDatabase } from "../db.js";

async function autoRetrain(dbPath: string) {
	const db = await loadDatabase(dbPath);
	const corrections = db.corrections;
	const negativeSamples = db.negativeSamples;

	const trainingData = [...corrections, ...negativeSamples];

	if (trainingData.length === 0) {
		console.log("No new data to train on.");
		return;
	}

	const tmp = path.join(
		os.tmpdir(),
		`tmp_training_data.${process.pid}.${Date.now()}.json`,
	);
	await fs.writeFile(tmp, JSON.stringify(trainingData));

	const script = config.trainScript;

	return new Promise<void>((resolve, reject) => {
		const child = spawn("python3", [script, tmp], {
			stdio: ["ignore", "pipe", "pipe"],
		});

		child.stdout.on("data", (data) => {
			console.log(`stdout: ${data.toString()}`);
		});

		child.stderr.on("data", (data) => {
			console.error(`stderr: ${data.toString()}`);
		});

		child.on("error", (err) => {
			fs.unlink(tmp).catch((unlinkErr) =>
				console.error(`Failed to delete temp file on error: ${unlinkErr}`),
			);
			reject(err);
		});

		child.on("close", (code) => {
			console.log(`child process exited with code ${code}`);
			fs.unlink(tmp)
				.catch((err) =>
					console.error(`Failed to delete temp file ${tmp}:`, err),
				)
				.finally(() => {
					if (code === 0) {
						resolve();
					} else {
						reject(new Error(`Training script exited with code ${code}`));
					}
				});
		});
	});
}

// determine where our database JSON lives
const dbPath = process.argv[2] ?? config.dbPath;

// run retraining asynchronously, but avoid unhandled rejections
// fire-and-forget with error handling
void autoRetrain(dbPath).catch((err) => {
	console.error("autoRetrain failed:", err);
	process.exitCode = 1;
});
