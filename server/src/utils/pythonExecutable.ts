import { existsSync } from "fs";
import path from "path";
import { SERVER_DIR } from "../constants/modelPaths.js";

function firstExisting(candidates: readonly string[]): string | null {
	for (const candidate of candidates) {
		if (candidate && existsSync(candidate)) {
			return candidate;
		}
	}
	return null;
}

export function resolvePythonExecutable(): string {
	const explicit = process.env.AMY_PYTHON_BIN?.trim();
	if (explicit) {
		return explicit;
	}

	const repoRoot = path.resolve(SERVER_DIR, "..");
	const localPython =
		firstExisting([
			path.join(repoRoot, ".venv", "bin", "python"),
			path.join(SERVER_DIR, ".venv", "bin", "python"),
		]) ?? "python3";

	return localPython;
}

export function withProjectPythonPath(
	env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
	const pythonDir = path.dirname(resolvePythonExecutable());
	return {
		...env,
		PATH: `${pythonDir}${path.delimiter}${env.PATH ?? ""}`,
	};
}
