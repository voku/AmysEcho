import type { Express } from "express";
import config from "../config/index.js";
import { ensureDataDir } from "../constants/modelPaths.js";
import logger from "../services/logger.js";

export function startServerWhenReady(
	app: Express,
	databaseReady: Promise<unknown>,
): void {
	const shouldAutoListen =
		!process.env.JEST_WORKER_ID &&
		process.env.AMY_ECHO_SKIP_LISTEN !== "1" &&
		process.env.AMY_ECHO_SKIP_LISTEN !== "true";
	if (!shouldAutoListen) {
		return;
	}

	databaseReady
		.then(async () => {
			await ensureDataDir();
			app.listen(config.port);
			logger.info("Server started successfully", { port: config.port });
		})
		.catch((error) => {
			const msg = (error as Error)?.message ?? String(error);
			logger.error("Server startup failed", { error: msg });
			process.exit(1);
		});
}
