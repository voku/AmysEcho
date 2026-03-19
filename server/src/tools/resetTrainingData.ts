import { resetTrainingData } from "../services/trainingResetService.js";

type CliOptions = {
	dbPath: string;
	dryRun: boolean;
	preserveGlobalModel: boolean;
	json: boolean;
};

function parseArgs(argv: string[]): CliOptions {
	const options: CliOptions = {
		dbPath: process.env.DB_PATH ?? `${process.cwd()}/db.json`,
		dryRun: false,
		preserveGlobalModel: true,
		json: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--db-path") {
			const next = argv[index + 1];
			if (!next) {
				throw new Error("--db-path benötigt einen Wert");
			}
			options.dbPath = next;
			index += 1;
			continue;
		}
		if (arg === "--dry-run") {
			options.dryRun = true;
			continue;
		}
		if (arg === "--drop-global-model") {
			options.preserveGlobalModel = false;
			continue;
		}
		if (arg === "--json") {
			options.json = true;
			continue;
		}
		throw new Error(`Unbekanntes Argument: ${arg}`);
	}

	return options;
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const summary = await resetTrainingData(options);

	if (options.json) {
		console.log(JSON.stringify(summary, null, 2));
		return;
	}

	console.log("Training-Daten erfolgreich zurückgesetzt.");
	console.log(`- Data dir: ${summary.dataDir}`);
	console.log(`- DB path: ${summary.dbPath}`);
	console.log(`- Dry run: ${summary.dryRun ? "ja" : "nein"}`);
	console.log(
		`- Globales Modell erhalten: ${summary.preserveGlobalModel ? "ja" : "nein"}`,
	);
	console.log(
		`- Manifest-Einträge entfernt: ${summary.trainingManifestEntriesCleared}`,
	);
	console.log(`- DGS-Samples entfernt: ${summary.dgsSamplesCleared}`);
	console.log(
		`- Qualitätslog-Einträge entfernt: ${summary.trainingQualityLogEntriesCleared}`,
	);
	console.log(
		`- Upload-Verzeichnisse geleert: ${summary.uploads.topLevelEntries}`,
	);
	console.log(
		`- User-Trainingsverzeichnisse geleert: ${summary.userTrainingData.topLevelEntries}`,
	);
	console.log(
		`- Modell-Verzeichnisse entfernt: ${summary.modelsRemoved.join(", ") || "keine"}`,
	);
	console.log(
		`- Custom-Signs beibehalten: ${summary.customSignsPreserved}`,
	);
	console.log(
		`- SQLite zurückgesetzt: signTrainingData=${summary.sqlite.signTrainingDataDeleted}, corrections=${summary.sqlite.correctionsDeleted}, negativeSamples=${summary.sqlite.negativeSamplesDeleted}, lastTrainedAt=${summary.sqlite.labelSettingsReset}`,
	);
}

void main().catch((error) => {
	console.error("resetTrainingData fehlgeschlagen:", error);
	process.exitCode = 1;
});
