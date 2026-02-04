import { promises as fs } from "fs";
import path from "path";
import config from "../config/index.js";
import { DATA_DIR } from "../constants/modelPaths.js";

/**
 * Audit event types for security-sensitive operations.
 * These events are logged for compliance and security monitoring.
 */
export type AuditEventType =
	// Authentication events
	| "AUTH_LOGIN_SUCCESS"
	| "AUTH_LOGIN_FAILURE"
	| "AUTH_LOGOUT"
	| "AUTH_TOKEN_REFRESH"
	| "AUTH_TOKEN_REFRESH_FAILURE"
	| "AUTH_PASSWORD_RESET_REQUEST"
	| "AUTH_PASSWORD_RESET_COMPLETE"
	| "AUTH_REGISTRATION"
	| "AUTH_EMAIL_VERIFICATION"
	// Profile access events
	| "PROFILE_ACCESS"
	| "PROFILE_CREATE"
	| "PROFILE_UPDATE"
	| "PROFILE_DELETE"
	| "PROFILE_EXPORT"
	| "PROFILE_SHARE"
	// Data events
	| "DATA_EXPORT"
	| "DATA_DELETE"
	| "TRAINING_DATA_UPLOAD"
	| "MODEL_DOWNLOAD"
	// Security events
	| "RATE_LIMIT_EXCEEDED"
	| "AUTHORIZATION_FAILURE"
	| "HTTPS_ENFORCEMENT_BLOCK"
	| "INVALID_TOKEN"
	| "SUSPICIOUS_ACTIVITY";

/**
 * Audit log entry structure.
 * Contains all information needed for security auditing and compliance.
 */
export interface AuditLogEntry {
	timestamp: string;
	eventType: AuditEventType;
	userId?: string;
	username?: string;
	targetUserId?: string;
	targetResourceId?: string;
	targetResourceType?: string;
	ip?: string;
	userAgent?: string;
	method?: string;
	path?: string;
	statusCode?: number;
	success: boolean;
	details?: Record<string, unknown>;
}

/**
 * Audit logger for security-sensitive events.
 * 
 * In production, logs to:
 * - Console (structured JSON for log aggregation)
 * - Audit log file (data/audit.log) for compliance
 * 
 * In development, logs to console in human-readable format.
 */
class AuditLogger {
	private readonly auditLogPath: string;

	constructor() {
		this.auditLogPath = path.join(DATA_DIR, "audit.log");
	}

	/**
	 * Log an audit event.
	 * This is the primary method for recording security-sensitive operations.
	 */
	async log(
		eventType: AuditEventType,
		options: Omit<AuditLogEntry, "timestamp" | "eventType">,
	): Promise<void> {
		const entry: AuditLogEntry = {
			timestamp: new Date().toISOString(),
			eventType,
			...options,
		};

		// Always log to console (structured for log aggregation)
		this.logToConsole(entry);

		// In production, also persist to file
		if (config.nodeEnv === "production") {
			await this.persistToFile(entry);
		}
	}

	/**
	 * Log authentication events (login, logout, token refresh)
	 */
	async logAuth(
		eventType: Extract<AuditEventType, `AUTH_${string}`>,
		options: {
			userId?: string;
			username?: string;
			ip?: string;
			userAgent?: string;
			success: boolean;
			details?: Record<string, unknown>;
		},
	): Promise<void> {
		await this.log(eventType, options);
	}

	/**
	 * Log profile access events
	 */
	async logProfileAccess(
		eventType: Extract<AuditEventType, `PROFILE_${string}`>,
		options: {
			userId: string;
			targetResourceId: string;
			ip?: string;
			success: boolean;
			details?: Record<string, unknown>;
		},
	): Promise<void> {
		await this.log(eventType, {
			...options,
			targetResourceType: "profile",
		});
	}

	/**
	 * Log data access/modification events
	 */
	async logDataEvent(
		eventType: Extract<AuditEventType, `DATA_${string}` | `TRAINING_${string}` | `MODEL_${string}`>,
		options: {
			userId?: string;
			targetResourceId?: string;
			targetResourceType?: string;
			ip?: string;
			success: boolean;
			details?: Record<string, unknown>;
		},
	): Promise<void> {
		await this.log(eventType, options);
	}

	/**
	 * Log security events (rate limiting, authorization failures, etc.)
	 */
	async logSecurityEvent(
		eventType: Extract<AuditEventType, "RATE_LIMIT_EXCEEDED" | "AUTHORIZATION_FAILURE" | "HTTPS_ENFORCEMENT_BLOCK" | "INVALID_TOKEN" | "SUSPICIOUS_ACTIVITY">,
		options: {
			userId?: string;
			ip?: string;
			method?: string;
			path?: string;
			details?: Record<string, unknown>;
		},
	): Promise<void> {
		await this.log(eventType, {
			...options,
			success: false,
		});
	}

	private logToConsole(entry: AuditLogEntry): void {
		const output = config.nodeEnv === "development"
			? `[AUDIT] ${entry.timestamp} ${entry.eventType} user=${entry.userId || "anonymous"} success=${entry.success}`
			: JSON.stringify({ ...entry, _type: "audit" });

		// Use console.log for audit events (not console.warn/error)
		// These are informational records, not errors
		console.log(output);
	}

	private async persistToFile(entry: AuditLogEntry): Promise<void> {
		try {
			// Ensure data directory exists
			await fs.mkdir(DATA_DIR, { recursive: true });
			
			// Append to audit log file
			const line = JSON.stringify(entry) + "\n";
			await fs.appendFile(this.auditLogPath, line);
		} catch (error) {
			// Log error but don't throw - audit logging should not break the app
			console.error(
				"[AUDIT] Failed to persist audit log:",
				error instanceof Error ? error.message : String(error),
			);
		}
	}
}

export const auditLogger = new AuditLogger();
export default auditLogger;
