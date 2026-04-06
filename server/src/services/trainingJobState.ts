import path from "path";
import { DATA_DIR } from "../constants/modelPaths.js";

export const TRAINING_RESTART_INTERRUPTION_REASON =
	"Training durch Server-Neustart unterbrochen. Bitte erneut starten.";

export const TRAINING_ORCHESTRATOR_JOB_STATE_FILE = path.join(
	DATA_DIR,
	"training-orchestrator-jobs.json",
);
