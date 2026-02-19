import path from "path";
import { SERVER_DIR, SRC_DIR } from "../constants/modelPaths.js";

export interface ServerConfig {
	port: number;
	nodeEnv: string;
	apiLimit: number;
	modelMetadataLimit: number;
	modelDownloadLimit: number;
	trainingLimit: number;
	profileBackupIntervalHours: number;
	mlpScript: string;
	trainingTimeoutMs: number;
	trainingSlaMs: number;
	trainingManifestCacheTtlMs: number;
	backupSecret: string;
	trainScript: string;
	dbPath: string;
	cloudApiUrl: string;
	offlineModelPath: string;
	gestureTaskUrl: string;
	jwtSecret: string;
	jwtRefreshSecret: string;
	smtpHost: string;
	smtpPort: number;
	smtpSecure: boolean;
	smtpUser?: string;
	smtpPass?: string;
	smtpFrom: string;
	smtpIgnoreCertErrors: boolean;
	appBaseUrl: string;
	mailTransport: "sendmail" | "smtp";
	sendmailPath: string;
	openAiApiKey?: string;
	openAiModel: string;
	openAiBaseUrl: string;
}

function getEnvVar(name: string, defaultValue?: string): string {
	const value = process.env[name];
	if (!value && !defaultValue) {
		throw new Error(`Environment variable ${name} is required`);
	}
	return value || defaultValue!;
}

function getRequiredEnvWithAliases(primary: string, aliases: readonly string[]): string {
	const primaryValue = process.env[primary];
	if (primaryValue) {
		return primaryValue;
	}

	for (const alias of aliases) {
		const aliasValue = process.env[alias];
		if (aliasValue) {
			console.warn(
				`Environment variable ${alias} is deprecated. Please rename it to ${primary}.`,
			);
			return aliasValue;
		}
	}

	throw new Error(
		`Environment variable ${primary} is required (accepted aliases: ${aliases.join(", ")})`,
	);
}

function getEnvVarAsNumber(name: string, defaultValue: number): number {
	const value = process.env[name];
	if (!value) return defaultValue;
	const parsed = parseInt(value, 10);
	if (isNaN(parsed)) {
		throw new Error(`Environment variable ${name} must be a valid number`);
	}
	return parsed;
}

export const config: ServerConfig = {
	port: getEnvVarAsNumber("PORT", 5000),
	nodeEnv: getEnvVar("NODE_ENV", "development"),
	apiLimit: getEnvVarAsNumber("API_LIMIT", 1000),
	modelMetadataLimit: getEnvVarAsNumber("MODEL_METADATA_LIMIT", 300),
	modelDownloadLimit: getEnvVarAsNumber("MODEL_DOWNLOAD_LIMIT", 120),
	trainingLimit: getEnvVarAsNumber("TRAINING_LIMIT", 120),
	profileBackupIntervalHours: getEnvVarAsNumber(
		"PROFILE_BACKUP_INTERVAL_HOURS",
		24,
	),
	mlpScript: getEnvVar(
		"MLP_SCRIPT",
		path.join(SRC_DIR, "amyserver_tools", "train_mlp.py"),
	),
	trainingTimeoutMs: getEnvVarAsNumber("TRAINING_JOB_TIMEOUT_MS", 600_000),
	trainingSlaMs: getEnvVarAsNumber("TRAINING_JOB_SLA_MS", 120_000),
	trainingManifestCacheTtlMs: getEnvVarAsNumber("TRAINING_MANIFEST_CACHE_TTL_MS", 30_000),
	// SECURITY: No default value for BACKUP_SECRET - must be explicitly configured
	// to prevent using a known default password for backups
	backupSecret: getEnvVar("BACKUP_SECRET"),
	trainScript: getEnvVar(
		"TRAIN_SCRIPT",
		path.join(SRC_DIR, "amyserver_tools", "train_mlp.py"),
	),
	dbPath: getEnvVar("DB_PATH", path.join(SERVER_DIR, "db.json")),
	cloudApiUrl: getEnvVar("CLOUD_API_URL", "http://localhost:4000/classify"),
	offlineModelPath: getEnvVar(
		"OFFLINE_MODEL_PATH",
		path.join(SRC_DIR, "offlineModel.json"),
	),
	gestureTaskUrl: getEnvVar(
		"GESTURE_TASK_URL",
		"https://api.github.com/repos/sst/dgs/contents/tasks",
	),
	jwtSecret: getRequiredEnvWithAliases("JWT_SECRET", ["JWT_ACCESS_SECRET"]),
	jwtRefreshSecret: getRequiredEnvWithAliases("JWT_REFRESH_SECRET", ["JWT_REFRESH_TOKEN_SECRET"]),
	smtpHost: getEnvVar("SMTP_HOST", "localhost"),
	smtpPort: getEnvVarAsNumber("SMTP_PORT", 1025),
	smtpSecure: getEnvVar("SMTP_SECURE", "false") === "true",
	smtpUser: process.env.SMTP_USER,
	smtpPass: process.env.SMTP_PASS,
	smtpFrom: getEnvVar("SMTP_FROM", "no-reply@amysecho.local"),
	smtpIgnoreCertErrors: process.env.SMTP_IGNORE_CERT_ERRORS === "true",
	appBaseUrl: getEnvVar("APP_BASE_URL", "http://localhost:5173"),
	mailTransport: (() => {
		const transport = process.env.MAIL_TRANSPORT;
		if (!transport) return "sendmail";
		if (transport === "sendmail" || transport === "smtp") return transport;
		throw new Error(
			`MAIL_TRANSPORT must be 'sendmail' or 'smtp', got '${transport}'`,
		);
	})(),
	sendmailPath: getEnvVar("SENDMAIL_PATH", "/usr/sbin/sendmail"),
	openAiApiKey: process.env.OPENAI_API_KEY,
	openAiModel: getEnvVar("OPENAI_MODEL", "gpt-4o-mini"),
	openAiBaseUrl: getEnvVar("OPENAI_BASE_URL", "https://api.openai.com/v1"),
};

export default config;
