import { promises as fs } from "fs";
import path from "path";
import { SERVER_DIR } from "../constants/modelPaths.js";

function getErrnoCode(error: unknown): string | undefined {
	return (error as NodeJS.ErrnoException | undefined)?.code;
}

export async function readServerPackageJson(): Promise<Record<string, unknown>> {
	const candidates = [
		path.join(SERVER_DIR, "package.json"),
		path.join(SERVER_DIR, "..", "package.json"),
	];
	for (const candidate of candidates) {
		try {
			const raw = await fs.readFile(candidate, "utf8");
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === "object") {
				return parsed as Record<string, unknown>;
			}
		} catch (error) {
			if (getErrnoCode(error) !== "ENOENT") {
				throw error;
			}
		}
	}
	throw new Error("package.json not found");
}
