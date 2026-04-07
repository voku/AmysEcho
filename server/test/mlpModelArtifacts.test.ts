import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

import { resolvePythonExecutable, withProjectPythonPath } from "../src/utils/pythonExecutable.js";

describe("writeMinimalMlpModel", () => {
  let tmpDir: string;
  let originalDataDir: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mlp-artifacts-"));
    originalDataDir = process.env.AMY_ECHO_DATA_DIR;
    process.env.AMY_ECHO_DATA_DIR = tmpDir;
    jest.resetModules();
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
    if (originalDataDir) {
      process.env.AMY_ECHO_DATA_DIR = originalDataDir;
    } else {
      delete process.env.AMY_ECHO_DATA_DIR;
    }
    jest.resetModules();
  });

  it('generates a neutral development model when no gesture counts exist', async () => {
    const [{ writeMinimalMlpModel, DEFAULT_BASELINE_LABELS }] = await Promise.all([
      import('../src/services/mlpModelArtifacts.js'),
      import("../src/constants/modelPaths.js"),
    ]);

    const destination = path.join(tmpDir, "models", "global", "amy_model.npz");
    const logMessages: string[] = [];

    await writeMinimalMlpModel(destination, {}, async (message) => {
      logMessages.push(message);
    });

    const destStat = await fs.stat(destination);
    expect(destStat.isFile()).toBe(true);

    const script = [
      "import json, numpy as np, sys",
      "data = np.load(sys.argv[1])",
      "keys = sorted(data.files)",
      "labels = data['labels'].tolist()",
      "shapes = {k: [int(x) for x in data[k].shape] for k in keys}",
      "print(json.dumps({'keys': keys, 'labels': labels, 'shapes': shapes}))",
    ].join("\n");
    const result = spawnSync(resolvePythonExecutable(), ["-c", script, destination], {
      encoding: "utf8",
      env: withProjectPythonPath(),
    });
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as { keys: string[]; labels: string[]; shapes: Record<string, number[]> };
    expect(parsed.keys).toEqual(["arch", "b1", "b2", "b3", "counts", "feature_size", "input_dim", "labels", "w1", "w2", "w3", "window_size"]);
    expect(parsed.labels).toEqual(DEFAULT_BASELINE_LABELS);
    expect(parsed.shapes["w1"][0]).toBeGreaterThan(0);
    expect(parsed.shapes["w1"][1]).toBeGreaterThan(0);
    expect(parsed.shapes["b1"][0]).toBe(parsed.shapes["w1"][0]);
    expect(parsed.shapes["w2"][1]).toBe(parsed.shapes["w1"][0]);
    expect(parsed.shapes["b2"][0]).toBe(parsed.shapes["w2"][0]);
    expect(parsed.shapes["w3"][1]).toBe(parsed.shapes["w2"][0]);
    expect(parsed.shapes["b3"][0]).toBe(parsed.shapes["w3"][0]);

    expect(logMessages.some((message) => message.includes("neutrales Entwicklungsmodell"))).toBe(true);
  });

  it('throws for empty datasets when strict baseline mode is enabled', async () => {
    const originalRequireBaseline = process.env.MLP_REQUIRE_BASELINE;
    process.env.MLP_REQUIRE_BASELINE = "1";
    jest.resetModules();
    const { writeMinimalMlpModel } = await import('../src/services/mlpModelArtifacts.js');

    const destination = path.join(tmpDir, 'models', 'global', 'amy_model.npz');

    try {
      await expect(writeMinimalMlpModel(destination, {}, async () => {})).rejects.toThrow(
        'persönliches Modell wird nicht aus dem globalen Demo-Modell kopiert',
      );
      await expect(fs.stat(destination)).rejects.toHaveProperty('code', 'ENOENT');
    } finally {
      if (originalRequireBaseline !== undefined) {
        process.env.MLP_REQUIRE_BASELINE = originalRequireBaseline;
      } else {
        delete process.env.MLP_REQUIRE_BASELINE;
      }
      jest.resetModules();
    }
  });
});
