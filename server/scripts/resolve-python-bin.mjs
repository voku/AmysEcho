/* global process */

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const serverRoot = path.resolve(__dirname, "..");

function firstExisting(candidates) {
	for (const candidate of candidates) {
		if (candidate && existsSync(candidate)) {
			return candidate;
		}
	}
	return null;
}

const explicit = process.env.AMY_PYTHON_BIN?.trim();
const resolved =
	explicit ||
	firstExisting([
		path.join(repoRoot, ".venv", "bin", "python"),
		path.join(serverRoot, ".venv", "bin", "python"),
	]) ||
	"python3";

process.stdout.write(resolved);
