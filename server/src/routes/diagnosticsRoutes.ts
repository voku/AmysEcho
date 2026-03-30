import { spawn } from "child_process";
import type { Express, Request, RequestHandler, Response } from "express";
import { promises as fs } from "fs";
import { DB_FILE_PATH } from "../constants/dbPaths.js";
import { getMlpModelPath } from "../constants/modelPaths.js";
import { resolvePythonExecutable, withProjectPythonPath } from "../utils/pythonExecutable.js";

interface RegisterDiagnosticsRoutesDeps {
	healthLimiter: RequestHandler;
	getPendingTrainingJobs: () => number;
	getTrainingManifestEntries: () => Promise<unknown[]>;
}

let pythonDepsCheckCache: {
	status: "ok" | "error";
	message: string;
	timestamp: number;
} | null = null;

const PYTHON_DEPS_CACHE_TTL_MS = 5 * 60 * 1000;
const PYTHON_DEPS_CHECK_TIMEOUT_MS = 5_000;

async function checkPythonDependencies(): Promise<{ status: "ok" | "error"; message: string }> {
	if (
		pythonDepsCheckCache &&
		Date.now() - pythonDepsCheckCache.timestamp < PYTHON_DEPS_CACHE_TTL_MS
	) {
		return {
			status: pythonDepsCheckCache.status,
			message: pythonDepsCheckCache.message,
		};
	}

	try {
		const pythonExecutable = resolvePythonExecutable();
		await new Promise<void>((resolve, reject) => {
			const proc = spawn(
				pythonExecutable,
				["-c", "import numpy, sklearn, mediapipe; print('ok')"],
				{ env: withProjectPythonPath() },
			);
			const timeout = setTimeout(() => {
				proc.kill("SIGKILL");
				reject(
					new Error(
						`Python dependency check timed out after ${PYTHON_DEPS_CHECK_TIMEOUT_MS}ms`,
					),
				);
			}, PYTHON_DEPS_CHECK_TIMEOUT_MS);
			timeout.unref();
			let stderr = "";
			proc.stderr.on("data", (data) => {
				stderr += data;
			});
			proc.on("close", (code) => {
				clearTimeout(timeout);
				if (code === 0) {
					resolve();
				} else {
					reject(
						new Error(
							`Python check failed with code ${code} using ${pythonExecutable}: ${stderr}`,
						),
					);
				}
			});
			proc.on("error", (error) => {
				clearTimeout(timeout);
				reject(error);
			});
		});

		const result = {
			status: "ok" as const,
			message: `Required Python packages installed (numpy, sklearn, mediapipe) via ${pythonExecutable}`,
		};
		pythonDepsCheckCache = { ...result, timestamp: Date.now() };
		return result;
	} catch (error) {
		const result = {
			status: "error" as const,
			message: error instanceof Error ? error.message : String(error),
		};
		pythonDepsCheckCache = { ...result, timestamp: Date.now() };
		return result;
	}
}

function createHealthHandler(
	getPendingTrainingJobs: () => number,
	getTrainingManifestEntries: () => Promise<unknown[]>,
) {
	return async (_req: Request, res: Response) => {
		const checks: Record<string, { status: string; message?: string; details?: unknown }> = {};
		let overallStatus = "ok";

		try {
			const dbExists = await fs.access(DB_FILE_PATH).then(() => true).catch(() => false);
			checks.database = {
				status: dbExists ? "ok" : "warning",
				message: dbExists
					? "Database file accessible"
					: "Database file not found (will be created on first write)",
			};
		} catch (error) {
			checks.database = {
				status: "error",
				message: error instanceof Error ? error.message : String(error),
			};
			overallStatus = "degraded";
		}

		try {
			const globalModelPath = getMlpModelPath();
			const modelExists = await fs.access(globalModelPath).then(() => true).catch(() => false);
			checks.globalModel = {
				status: modelExists ? "ok" : "warning",
				message: modelExists
					? "Global model available"
					: "Global model not found (will be created on first training)",
				details: { path: globalModelPath },
			};
		} catch (error) {
			checks.globalModel = {
				status: "error",
				message: error instanceof Error ? error.message : String(error),
			};
			overallStatus = "degraded";
		}

		const pythonCheck = await checkPythonDependencies();
		checks.pythonDependencies = {
			status: pythonCheck.status,
			message: pythonCheck.message,
		};
		if (pythonCheck.status === "error") {
			overallStatus = "degraded";
		}

			try {
				const manifestEntries = await getTrainingManifestEntries();
				checks.trainingManifest = {
					status: "ok",
					message: `Training manifest entries in SQLite: ${manifestEntries.length}`,
			};
		} catch (error) {
			checks.trainingManifest = {
				status: "error",
				message: error instanceof Error ? error.message : String(error),
			};
			overallStatus = "degraded";
		}

		res.json({
			status: overallStatus,
			uptime: process.uptime(),
			pendingTrainingJobs: getPendingTrainingJobs(),
			checks,
			timestamp: new Date().toISOString(),
		});
	};
}

export function registerDiagnosticsRoutes(
	app: Express,
	deps: RegisterDiagnosticsRoutesDeps,
): void {
	const healthHandler = createHealthHandler(
		deps.getPendingTrainingJobs,
		deps.getTrainingManifestEntries,
	);
	app.get("/health", deps.healthLimiter, healthHandler);
	app.get("/api/v1/health", deps.healthLimiter, healthHandler);
}
