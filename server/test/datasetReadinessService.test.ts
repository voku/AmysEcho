import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { runDatasetReadinessEvaluation } from "../src/services/datasetReadinessService.js";

const FEATURE_CONTRACT = {
	version: "wrist_relative_max_abs_v1",
	normalization: "wrist_relative_max_abs",
	handOrder: ["Left", "Right"],
	missingHandStrategy: "zero_pad",
	pointsPerHand: 21,
	coordinatesPerPoint: 3,
	vectorLength: 126,
} as const;

function buildFrame(index: number): { timestampMs: number; landmarks: number[][] } {
	const landmarks = Array.from({ length: 42 }, (_, landmarkIndex) => {
		const base = ((index + landmarkIndex) % 20) / 100;
		return [base, Math.min(base + 0.05, 0.95), base / 2];
	});
	return {
		timestampMs: index * 33,
		landmarks,
	};
}

async function writeBundle(
	dataDir: string,
	bundleId: string,
	label: string,
	profileId: string,
): Promise<Record<string, unknown>> {
	const bundleRel = path.join("training_uploads", profileId, bundleId);
	const bundleDir = path.join(dataDir, bundleRel);
	await fs.mkdir(bundleDir, { recursive: true });
	await fs.writeFile(
		path.join(bundleDir, "landmarks.json"),
		JSON.stringify({
			frames: Array.from({ length: 30 }, (_, index) => buildFrame(index)),
		}),
		"utf8",
	);
	return {
		id: bundleId,
		profileId,
		label,
		storage: {
			directory: bundleRel,
			files: ["landmarks.json"],
		},
		metadata: {
			label,
			profileId,
			featureContract: FEATURE_CONTRACT,
			recording: {
				frameCount: 30,
				usableFrameCount: 30,
				clipDurationMs: 990,
			},
			modalities: {
				hands: { coverage: 1.0 },
				pose: { coverage: 0.5 },
				face: { coverage: 0.5 },
				nonManual: { coverage: 0.0 },
			},
		},
	};
}

describe("datasetReadinessService", () => {
	it("writes a manifest snapshot and reads summary.json", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "amy-dataset-readiness-"));
		const dataDir = path.join(tempDir, "data");
		const reportDir = path.join(tempDir, "reports");
		const fakePythonPath = path.join(tempDir, "fake-python.sh");
		const originalPythonBin = process.env.AMY_PYTHON_BIN;
		await fs.writeFile(
			fakePythonPath,
			[
				"#!/bin/sh",
				'output_dir=""',
				'while [ "$#" -gt 0 ]; do',
				'  if [ "$1" = "--output-dir" ]; then',
				'    output_dir="$2"',
				'    shift 2',
				'    continue',
				"  fi",
				"  shift",
				"done",
				'mkdir -p "$output_dir"',
				`cat <<'EOF' > "$output_dir/summary.json"`,
				JSON.stringify({
					protocol: "dataset_readiness_v1",
					status: "ready",
				}),
				"EOF",
			].join("\n"),
			"utf8",
		);
		await fs.chmod(fakePythonPath, 0o755);
		process.env.AMY_PYTHON_BIN = fakePythonPath;
		try {
			const manifest = {
				entries: [
					await writeBundle(dataDir, "bundle-1", "HALLO", "profile-a"),
					await writeBundle(dataDir, "bundle-2", "HALLO", "profile-b"),
					await writeBundle(dataDir, "bundle-3", "BITTE", "profile-a"),
					await writeBundle(dataDir, "bundle-4", "BITTE", "profile-b"),
				],
			};

			const summary = await runDatasetReadinessEvaluation({
				reportDir,
				dataDir,
				manifest,
				cacheTtlMs: 0,
				forceRefresh: true,
			});

			const manifestSnapshot = JSON.parse(
				await fs.readFile(path.join(reportDir, "manifest_snapshot.json"), "utf8"),
			) as { entries: unknown[] };
			expect(manifestSnapshot.entries).toHaveLength(4);
			expect(summary["protocol"]).toBe("dataset_readiness_v1");

			const writtenSummary = JSON.parse(
				await fs.readFile(path.join(reportDir, "summary.json"), "utf8"),
			) as Record<string, unknown>;
			expect(writtenSummary["protocol"]).toBe("dataset_readiness_v1");
		} finally {
			if (originalPythonBin) {
				process.env.AMY_PYTHON_BIN = originalPythonBin;
			} else {
				delete process.env.AMY_PYTHON_BIN;
			}
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
