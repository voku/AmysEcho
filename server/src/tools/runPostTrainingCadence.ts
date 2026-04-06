#!/usr/bin/env node

import path from "path";
import { runPostTrainingCadenceCycle } from "../services/postTrainingCadenceService.js";

type CliOptions = {
	dryRun: boolean;
	reportDir?: string;
	retentionDays?: number;
	stateFilePath?: string;
};

function parseArgs(argv: string[]): CliOptions {
	const options: CliOptions = {
		dryRun: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--dry-run") {
			options.dryRun = true;
			continue;
		}
		if (arg === "--report-dir") {
			options.reportDir = argv[index + 1];
			index += 1;
			continue;
		}
		if (arg === "--retention-days") {
			options.retentionDays = Number.parseInt(argv[index + 1] ?? "", 10);
			index += 1;
			continue;
		}
		if (arg === "--state-file") {
			options.stateFilePath = argv[index + 1];
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}

	return options;
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const summary = await runPostTrainingCadenceCycle({
		dryRun: options.dryRun,
		reportDir: options.reportDir ? path.resolve(options.reportDir) : undefined,
		retentionDays: options.retentionDays,
		stateFilePath: options.stateFilePath
			? path.resolve(options.stateFilePath)
			: undefined,
	});

	console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
	console.error(
		error instanceof Error ? error.message : String(error),
	);
	process.exitCode = 1;
});
