/**
 * SQLite database backend for Amy's Echo
 *
 * This module provides a SQLite-based storage layer that replaces the file-based db.json.
 * Key features:
 * - WAL mode for concurrent reads/writes
 * - Automatic migration from existing JSON database
 * - Full CRUD operations matching the original db.ts API
 * - Indexed tables for performant lookups
 */

import Database from "better-sqlite3";
import { promises as fs } from "fs";
import path from "path";
import type {
	Correction,
	InteractionLog,
	LearningAnalytics,
	NegativeSample,
	Profile,
	SignDefinition,
	SignTrainingData,
	StoredUser,
	SymbolRecord,
	UsageStat,
	VocabularySet,
	VocabularySetSymbol,
} from "./types.js";
import type { Database as DatabaseType } from "./db.js";

// Singleton database connection
let db: Database.Database | null = null;
let currentDbPath: string | null = null;

/**
 * Initialize SQLite database connection with WAL mode
 * @param sqlitePath - Path to the SQLite database file
 * @param jsonPath - Path to existing JSON database for migration (optional)
 */
export async function initializeDatabase(
	sqlitePath: string,
	jsonPath?: string,
): Promise<void> {
	// Close existing connection if switching databases
	if (db && currentDbPath !== sqlitePath) {
		db.close();
		db = null;
	}

	if (db) return;

	await fs.mkdir(path.dirname(sqlitePath), { recursive: true });

	db = new Database(sqlitePath);
	currentDbPath = sqlitePath;

	// Enable WAL mode for better concurrent access
	db.pragma("journal_mode = WAL");
	db.pragma("foreign_keys = ON");

	// Create tables
	createTables();

	// Migrate from JSON if exists and tables are empty
	if (jsonPath) {
		await migrateFromJson(jsonPath);
	}
}

/**
 * Get the current database connection
 * Throws if not initialized
 */
export function getDb(): Database.Database {
	if (!db) {
		throw new Error("Database not initialized. Call initializeDatabase first.");
	}
	return db;
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
	if (db) {
		db.close();
		db = null;
		currentDbPath = null;
	}
}

/**
 * Create all database tables with proper indexes
 */
function createTables(): void {
	const database = getDb();

	// Users table
	database.exec(`
		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			username TEXT NOT NULL UNIQUE COLLATE NOCASE,
			email TEXT NOT NULL UNIQUE COLLATE NOCASE,
			passwordHash TEXT NOT NULL,
			displayName TEXT,
			role TEXT NOT NULL DEFAULT 'caregiver',
			createdAt INTEGER NOT NULL,
			emailVerifiedAt INTEGER,
			emailVerificationTokenHash TEXT,
			emailVerificationExpiresAt INTEGER,
			emailVerificationSentAt INTEGER,
			passwordResetTokenHash TEXT,
			passwordResetExpiresAt INTEGER,
			passwordResetRequestedAt INTEGER
		);
		CREATE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE);
		CREATE INDEX IF NOT EXISTS idx_users_email ON users(email COLLATE NOCASE);
	`);

	// Profiles table
	database.exec(`
		CREATE TABLE IF NOT EXISTS profiles (
			id TEXT PRIMARY KEY,
			userId TEXT NOT NULL,
			displayName TEXT NOT NULL,
			createdAt TEXT NOT NULL,
			metadata TEXT,
			consentDataUpload INTEGER NOT NULL DEFAULT 0,
			consentHelpMeGetSmarter INTEGER NOT NULL DEFAULT 0,
			vocabularySetId TEXT NOT NULL DEFAULT 'basic',
			largeText INTEGER,
			highContrast INTEGER
		);
		CREATE INDEX IF NOT EXISTS idx_profiles_userId ON profiles(userId);
	`);

	// Symbols table
	database.exec(`
		CREATE TABLE IF NOT EXISTS symbols (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			emoji TEXT NOT NULL,
			color TEXT NOT NULL,
			category TEXT,
			imageUrl TEXT,
			audioUri TEXT NOT NULL,
			dgsVideoUri TEXT,
			healthScore REAL NOT NULL DEFAULT 1,
			profileId TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_symbols_profileId ON symbols(profileId);
	`);

	// Sign definitions table
	database.exec(`
		CREATE TABLE IF NOT EXISTS signDefinitions (
			id TEXT PRIMARY KEY,
			symbolId TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'training',
			healthScore REAL NOT NULL DEFAULT 0,
			minConfidenceThreshold REAL NOT NULL DEFAULT 0.5
		);
		CREATE INDEX IF NOT EXISTS idx_signDefinitions_symbolId ON signDefinitions(symbolId);
	`);

	// Sign training data table
	database.exec(`
		CREATE TABLE IF NOT EXISTS signTrainingData (
			id TEXT PRIMARY KEY,
			signId TEXT NOT NULL,
			landmarkData TEXT NOT NULL,
			source TEXT NOT NULL,
			syncStatus TEXT NOT NULL DEFAULT 'pending',
			approved INTEGER NOT NULL DEFAULT 0
		);
		CREATE INDEX IF NOT EXISTS idx_signTrainingData_signId ON signTrainingData(signId);
	`);

	// Interaction logs table
	database.exec(`
		CREATE TABLE IF NOT EXISTS interactionLogs (
			id TEXT PRIMARY KEY,
			signId TEXT NOT NULL,
			wasSuccessful INTEGER NOT NULL DEFAULT 0,
			confidenceScore REAL NOT NULL DEFAULT 0,
			timestamp INTEGER NOT NULL,
			caregiverOverrideId TEXT,
			processedBy TEXT NOT NULL DEFAULT 'local'
		);
		CREATE INDEX IF NOT EXISTS idx_interactionLogs_signId ON interactionLogs(signId);
		CREATE INDEX IF NOT EXISTS idx_interactionLogs_timestamp ON interactionLogs(timestamp);
	`);

	// Vocabulary sets table
	database.exec(`
		CREATE TABLE IF NOT EXISTS vocabularySets (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL
		);
	`);

	// Vocabulary set symbols table
	database.exec(`
		CREATE TABLE IF NOT EXISTS vocabularySetSymbols (
			id TEXT PRIMARY KEY,
			vocabularySetId TEXT NOT NULL,
			symbolId TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_vocabularySetSymbols_vocabularySetId ON vocabularySetSymbols(vocabularySetId);
		CREATE INDEX IF NOT EXISTS idx_vocabularySetSymbols_symbolId ON vocabularySetSymbols(symbolId);
	`);

	// Usage stats table
	database.exec(`
		CREATE TABLE IF NOT EXISTS usageStats (
			id TEXT PRIMARY KEY,
			symbolId TEXT NOT NULL,
			profileId TEXT NOT NULL,
			count INTEGER NOT NULL DEFAULT 0
		);
		CREATE INDEX IF NOT EXISTS idx_usageStats_symbolId ON usageStats(symbolId);
		CREATE INDEX IF NOT EXISTS idx_usageStats_profileId ON usageStats(profileId);
	`);

	// Learning analytics table
	database.exec(`
		CREATE TABLE IF NOT EXISTS learningAnalytics (
			id TEXT PRIMARY KEY,
			signId TEXT NOT NULL,
			successRate24h REAL NOT NULL DEFAULT 0,
			successRate7d REAL NOT NULL DEFAULT 0,
			avgConfidenceScore REAL NOT NULL DEFAULT 0,
			improvementTrend REAL NOT NULL DEFAULT 0,
			lastCalculated INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_learningAnalytics_signId ON learningAnalytics(signId);
	`);

	// Corrections table
	database.exec(`
		CREATE TABLE IF NOT EXISTS corrections (
			id TEXT PRIMARY KEY,
			predictedSign TEXT NOT NULL,
			actualSign TEXT NOT NULL,
			confidence REAL NOT NULL DEFAULT 0,
			timestamp INTEGER NOT NULL,
			isSynced INTEGER NOT NULL DEFAULT 0,
			profileId TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_corrections_profileId ON corrections(profileId);
		CREATE INDEX IF NOT EXISTS idx_corrections_timestamp ON corrections(timestamp);
	`);

	// Negative samples table
	database.exec(`
		CREATE TABLE IF NOT EXISTS negativeSamples (
			id TEXT PRIMARY KEY,
			sign TEXT NOT NULL,
			timestamp INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_negativeSamples_timestamp ON negativeSamples(timestamp);
	`);
}

/**
 * Migrate from JSON database to SQLite
 * Creates a backup of the JSON file after successful migration
 */
async function migrateFromJson(jsonPath: string): Promise<void> {
	const database = getDb();

	// Check if migration is needed (tables have data)
	const userCount = database.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
	if (userCount.count > 0) {
		return; // Already has data, skip migration
	}

	// Try to read JSON database
	let jsonData: DatabaseType;
	try {
		const data = await fs.readFile(jsonPath, "utf8");
		jsonData = JSON.parse(data) as DatabaseType;
	} catch {
		// No JSON file to migrate from
		return;
	}

	// Migrate in a transaction
	const migrate = database.transaction(() => {
		// Migrate users
		const insertUser = database.prepare(`
			INSERT OR IGNORE INTO users (
				id, username, email, passwordHash, displayName, role, createdAt,
				emailVerifiedAt, emailVerificationTokenHash, emailVerificationExpiresAt,
				emailVerificationSentAt, passwordResetTokenHash, passwordResetExpiresAt,
				passwordResetRequestedAt
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);
		for (const user of jsonData.users || []) {
			insertUser.run(
				user.id,
				user.username,
				user.email,
				user.passwordHash,
				user.displayName ?? null,
				user.role,
				user.createdAt,
				user.emailVerifiedAt ?? null,
				user.emailVerificationTokenHash ?? null,
				user.emailVerificationExpiresAt ?? null,
				user.emailVerificationSentAt ?? null,
				user.passwordResetTokenHash ?? null,
				user.passwordResetExpiresAt ?? null,
				user.passwordResetRequestedAt ?? null,
			);
		}

		// Migrate profiles
		const insertProfile = database.prepare(`
			INSERT OR IGNORE INTO profiles (
				id, userId, displayName, createdAt, metadata,
				consentDataUpload, consentHelpMeGetSmarter, vocabularySetId,
				largeText, highContrast
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);
		for (const profile of jsonData.profiles || []) {
			insertProfile.run(
				profile.id,
				profile.userId,
				profile.displayName,
				profile.createdAt,
				profile.metadata ? JSON.stringify(profile.metadata) : null,
				profile.consentDataUpload ? 1 : 0,
				profile.consentHelpMeGetSmarter ? 1 : 0,
				profile.vocabularySetId,
				profile.largeText === undefined ? null : (profile.largeText ? 1 : 0),
				profile.highContrast === undefined ? null : (profile.highContrast ? 1 : 0),
			);
		}

		// Migrate symbols
		const insertSymbol = database.prepare(`
			INSERT OR IGNORE INTO symbols (
				id, name, emoji, color, category, imageUrl, audioUri,
				dgsVideoUri, healthScore, profileId
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);
		for (const symbol of jsonData.symbols || []) {
			insertSymbol.run(
				symbol.id,
				symbol.name,
				symbol.emoji,
				symbol.color,
				symbol.category ?? null,
				symbol.imageUrl ?? null,
				symbol.audioUri,
				symbol.dgsVideoUri ?? null,
				symbol.healthScore,
				symbol.profileId ?? null,
			);
		}

		// Migrate sign definitions
		const insertSignDef = database.prepare(`
			INSERT OR IGNORE INTO signDefinitions (
				id, symbolId, status, healthScore, minConfidenceThreshold
			) VALUES (?, ?, ?, ?, ?)
		`);
		for (const def of jsonData.signDefinitions || []) {
			insertSignDef.run(
				def.id,
				def.symbolId,
				def.status,
				def.healthScore,
				def.minConfidenceThreshold,
			);
		}

		// Migrate sign training data
		const insertTrainingData = database.prepare(`
			INSERT OR IGNORE INTO signTrainingData (
				id, signId, landmarkData, source, syncStatus, approved
			) VALUES (?, ?, ?, ?, ?, ?)
		`);
		for (const data of jsonData.signTrainingData || []) {
			insertTrainingData.run(
				data.id,
				data.signId,
				JSON.stringify(data.landmarkData),
				data.source,
				data.syncStatus,
				data.approved ? 1 : 0,
			);
		}

		// Migrate interaction logs
		const insertLog = database.prepare(`
			INSERT OR IGNORE INTO interactionLogs (
				id, signId, wasSuccessful, confidenceScore, timestamp,
				caregiverOverrideId, processedBy
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`);
		for (const log of jsonData.interactionLogs || []) {
			insertLog.run(
				log.id,
				log.signId,
				log.wasSuccessful ? 1 : 0,
				log.confidenceScore,
				log.timestamp,
				log.caregiverOverrideId ?? null,
				log.processedBy,
			);
		}

		// Migrate vocabulary sets
		const insertVocabSet = database.prepare(`
			INSERT OR IGNORE INTO vocabularySets (id, name) VALUES (?, ?)
		`);
		for (const set of jsonData.vocabularySets || []) {
			insertVocabSet.run(set.id, set.name);
		}

		// Migrate vocabulary set symbols
		const insertVocabSymbol = database.prepare(`
			INSERT OR IGNORE INTO vocabularySetSymbols (id, vocabularySetId, symbolId)
			VALUES (?, ?, ?)
		`);
		for (const link of jsonData.vocabularySetSymbols || []) {
			insertVocabSymbol.run(link.id, link.vocabularySetId, link.symbolId);
		}

		// Migrate usage stats
		const insertUsageStat = database.prepare(`
			INSERT OR IGNORE INTO usageStats (id, symbolId, profileId, count)
			VALUES (?, ?, ?, ?)
		`);
		for (const stat of jsonData.usageStats || []) {
			insertUsageStat.run(stat.id, stat.symbolId, stat.profileId, stat.count);
		}

		// Migrate learning analytics
		const insertAnalytics = database.prepare(`
			INSERT OR IGNORE INTO learningAnalytics (
				id, signId, successRate24h, successRate7d, avgConfidenceScore,
				improvementTrend, lastCalculated
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`);
		for (const la of jsonData.learningAnalytics || []) {
			insertAnalytics.run(
				la.id,
				la.signId,
				la.successRate24h,
				la.successRate7d,
				la.avgConfidenceScore,
				la.improvementTrend,
				la.lastCalculated,
			);
		}

		// Migrate corrections
		const insertCorrection = database.prepare(`
			INSERT OR IGNORE INTO corrections (
				id, predictedSign, actualSign, confidence, timestamp, isSynced, profileId
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`);
		for (const corr of jsonData.corrections || []) {
			insertCorrection.run(
				corr.id,
				corr.predictedSign,
				corr.actualSign,
				corr.confidence,
				corr.timestamp,
				corr.isSynced ? 1 : 0,
				corr.profileId ?? null,
			);
		}

		// Migrate negative samples
		const insertNegative = database.prepare(`
			INSERT OR IGNORE INTO negativeSamples (id, sign, timestamp)
			VALUES (?, ?, ?)
		`);
		for (const sample of jsonData.negativeSamples || []) {
			insertNegative.run(sample.id, sample.sign, sample.timestamp);
		}
	});

	migrate();

	// Create backup of JSON file
	try {
		await fs.copyFile(jsonPath, `${jsonPath}.migrated.backup`);
		console.log("JSON database migrated successfully to SQLite");
	} catch (error) {
		console.warn("Could not create migration backup:", error);
	}
}

// ==================== USER OPERATIONS ====================

export function getAllUsers(): StoredUser[] {
	const rows = getDb().prepare("SELECT * FROM users").all() as any[];
	return rows.map(rowToUser);
}

export function getUserById(id: string): StoredUser | undefined {
	const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
	return row ? rowToUser(row) : undefined;
}

export function getUserByUsername(username: string): StoredUser | undefined {
	const normalized = username.trim().toLowerCase();
	// Values are stored normalized (lowercase), so no COLLATE NOCASE needed
	const row = getDb()
		.prepare("SELECT * FROM users WHERE username = ?")
		.get(normalized) as any;
	return row ? rowToUser(row) : undefined;
}

export function getUserByEmail(email: string): StoredUser | undefined {
	const normalized = email.trim().toLowerCase();
	// Values are stored normalized (lowercase), so no COLLATE NOCASE needed
	const row = getDb()
		.prepare("SELECT * FROM users WHERE email = ?")
		.get(normalized) as any;
	return row ? rowToUser(row) : undefined;
}

export function insertUser(user: StoredUser): void {
	// Let database UNIQUE constraints handle duplicates - more atomic and reliable
	getDb().prepare(`
		INSERT INTO users (
			id, username, email, passwordHash, displayName, role, createdAt,
			emailVerifiedAt, emailVerificationTokenHash, emailVerificationExpiresAt,
			emailVerificationSentAt, passwordResetTokenHash, passwordResetExpiresAt,
			passwordResetRequestedAt
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(
		user.id,
		user.username.trim().toLowerCase(),
		user.email.trim().toLowerCase(),
		user.passwordHash,
		user.displayName ?? null,
		user.role,
		user.createdAt,
		user.emailVerifiedAt ?? null,
		user.emailVerificationTokenHash ?? null,
		user.emailVerificationExpiresAt ?? null,
		user.emailVerificationSentAt ?? null,
		user.passwordResetTokenHash ?? null,
		user.passwordResetExpiresAt ?? null,
		user.passwordResetRequestedAt ?? null,
	);
}

export function updateUserInDb(user: StoredUser): void {
	getDb().prepare(`
		UPDATE users SET
			username = ?,
			email = ?,
			passwordHash = ?,
			displayName = ?,
			role = ?,
			createdAt = ?,
			emailVerifiedAt = ?,
			emailVerificationTokenHash = ?,
			emailVerificationExpiresAt = ?,
			emailVerificationSentAt = ?,
			passwordResetTokenHash = ?,
			passwordResetExpiresAt = ?,
			passwordResetRequestedAt = ?
		WHERE id = ?
	`).run(
		user.username.trim().toLowerCase(),
		user.email.trim().toLowerCase(),
		user.passwordHash,
		user.displayName ?? null,
		user.role,
		user.createdAt,
		user.emailVerifiedAt ?? null,
		user.emailVerificationTokenHash ?? null,
		user.emailVerificationExpiresAt ?? null,
		user.emailVerificationSentAt ?? null,
		user.passwordResetTokenHash ?? null,
		user.passwordResetExpiresAt ?? null,
		user.passwordResetRequestedAt ?? null,
		user.id,
	);
}

export function deleteUserById(id: string): void {
	getDb().prepare("DELETE FROM users WHERE id = ?").run(id);
}

function rowToUser(row: any): StoredUser {
	return {
		id: row.id,
		username: row.username,
		email: row.email,
		passwordHash: row.passwordHash,
		displayName: row.displayName ?? undefined,
		role: row.role,
		createdAt: row.createdAt,
		emailVerifiedAt: row.emailVerifiedAt ?? undefined,
		emailVerificationTokenHash: row.emailVerificationTokenHash ?? undefined,
		emailVerificationExpiresAt: row.emailVerificationExpiresAt ?? undefined,
		emailVerificationSentAt: row.emailVerificationSentAt ?? undefined,
		passwordResetTokenHash: row.passwordResetTokenHash ?? undefined,
		passwordResetExpiresAt: row.passwordResetExpiresAt ?? undefined,
		passwordResetRequestedAt: row.passwordResetRequestedAt ?? undefined,
	};
}

// ==================== PROFILE OPERATIONS ====================

export function getAllProfiles(): Profile[] {
	const rows = getDb().prepare("SELECT * FROM profiles").all() as any[];
	return rows.map(rowToProfile);
}

export function getProfileById(id: string): Profile | undefined {
	const row = getDb().prepare("SELECT * FROM profiles WHERE id = ?").get(id) as any;
	return row ? rowToProfile(row) : undefined;
}

export function getProfilesByUserId(userId: string): Profile[] {
	const rows = getDb().prepare("SELECT * FROM profiles WHERE userId = ?").all(userId) as any[];
	return rows.map(rowToProfile);
}

export function insertProfile(profile: Profile): void {
	getDb().prepare(`
		INSERT INTO profiles (
			id, userId, displayName, createdAt, metadata,
			consentDataUpload, consentHelpMeGetSmarter, vocabularySetId,
			largeText, highContrast
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(
		profile.id,
		profile.userId,
		profile.displayName,
		profile.createdAt,
		profile.metadata ? JSON.stringify(profile.metadata) : null,
		profile.consentDataUpload ? 1 : 0,
		profile.consentHelpMeGetSmarter ? 1 : 0,
		profile.vocabularySetId,
		profile.largeText === undefined ? null : (profile.largeText ? 1 : 0),
		profile.highContrast === undefined ? null : (profile.highContrast ? 1 : 0),
	);
}

export function updateProfileInDb(profile: Profile): void {
	getDb().prepare(`
		UPDATE profiles SET
			userId = ?,
			displayName = ?,
			createdAt = ?,
			metadata = ?,
			consentDataUpload = ?,
			consentHelpMeGetSmarter = ?,
			vocabularySetId = ?,
			largeText = ?,
			highContrast = ?
		WHERE id = ?
	`).run(
		profile.userId,
		profile.displayName,
		profile.createdAt,
		profile.metadata ? JSON.stringify(profile.metadata) : null,
		profile.consentDataUpload ? 1 : 0,
		profile.consentHelpMeGetSmarter ? 1 : 0,
		profile.vocabularySetId,
		profile.largeText === undefined ? null : (profile.largeText ? 1 : 0),
		profile.highContrast === undefined ? null : (profile.highContrast ? 1 : 0),
		profile.id,
	);
}

export function deleteProfileById(id: string): void {
	getDb().prepare("DELETE FROM profiles WHERE id = ?").run(id);
}

function rowToProfile(row: any): Profile {
	return {
		id: row.id,
		userId: row.userId,
		displayName: row.displayName,
		createdAt: row.createdAt,
		metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
		consentDataUpload: row.consentDataUpload === 1,
		consentHelpMeGetSmarter: row.consentHelpMeGetSmarter === 1,
		vocabularySetId: row.vocabularySetId,
		largeText: row.largeText === null ? undefined : row.largeText === 1,
		highContrast: row.highContrast === null ? undefined : row.highContrast === 1,
	};
}

// ==================== SYMBOL OPERATIONS ====================

export function getAllSymbols(): SymbolRecord[] {
	const rows = getDb().prepare("SELECT * FROM symbols").all() as any[];
	return rows.map(rowToSymbol);
}

export function getSymbolById(id: string): SymbolRecord | undefined {
	const row = getDb().prepare("SELECT * FROM symbols WHERE id = ?").get(id) as any;
	return row ? rowToSymbol(row) : undefined;
}

export function getSymbolsByProfileId(profileId: string | null): SymbolRecord[] {
	if (profileId === null) {
		const rows = getDb().prepare("SELECT * FROM symbols WHERE profileId IS NULL").all() as any[];
		return rows.map(rowToSymbol);
	}
	const rows = getDb().prepare("SELECT * FROM symbols WHERE profileId = ?").all(profileId) as any[];
	return rows.map(rowToSymbol);
}

export function insertSymbol(symbol: SymbolRecord): void {
	getDb().prepare(`
		INSERT INTO symbols (
			id, name, emoji, color, category, imageUrl, audioUri,
			dgsVideoUri, healthScore, profileId
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(
		symbol.id,
		symbol.name,
		symbol.emoji,
		symbol.color,
		symbol.category ?? null,
		symbol.imageUrl ?? null,
		symbol.audioUri,
		symbol.dgsVideoUri ?? null,
		symbol.healthScore,
		symbol.profileId ?? null,
	);
}

export function updateSymbolInDb(symbol: SymbolRecord): void {
	getDb().prepare(`
		UPDATE symbols SET
			name = ?,
			emoji = ?,
			color = ?,
			category = ?,
			imageUrl = ?,
			audioUri = ?,
			dgsVideoUri = ?,
			healthScore = ?,
			profileId = ?
		WHERE id = ?
	`).run(
		symbol.name,
		symbol.emoji,
		symbol.color,
		symbol.category ?? null,
		symbol.imageUrl ?? null,
		symbol.audioUri,
		symbol.dgsVideoUri ?? null,
		symbol.healthScore,
		symbol.profileId ?? null,
		symbol.id,
	);
}

export function deleteSymbolById(id: string): void {
	getDb().prepare("DELETE FROM symbols WHERE id = ?").run(id);
}

function rowToSymbol(row: any): SymbolRecord {
	return {
		id: row.id,
		name: row.name,
		emoji: row.emoji,
		color: row.color,
		category: row.category ?? undefined,
		imageUrl: row.imageUrl ?? undefined,
		audioUri: row.audioUri,
		dgsVideoUri: row.dgsVideoUri ?? undefined,
		healthScore: row.healthScore,
		profileId: row.profileId ?? undefined,
	};
}

// ==================== SIGN DEFINITION OPERATIONS ====================

export function getAllSignDefinitions(): SignDefinition[] {
	const rows = getDb().prepare("SELECT * FROM signDefinitions").all() as any[];
	return rows.map(rowToSignDefinition);
}

export function getSignDefinitionById(id: string): SignDefinition | undefined {
	const row = getDb().prepare("SELECT * FROM signDefinitions WHERE id = ?").get(id) as any;
	return row ? rowToSignDefinition(row) : undefined;
}

export function insertSignDefinition(def: SignDefinition): void {
	getDb().prepare(`
		INSERT INTO signDefinitions (id, symbolId, status, healthScore, minConfidenceThreshold)
		VALUES (?, ?, ?, ?, ?)
	`).run(def.id, def.symbolId, def.status, def.healthScore, def.minConfidenceThreshold);
}

export function updateSignDefinitionInDb(def: SignDefinition): void {
	getDb().prepare(`
		UPDATE signDefinitions SET
			symbolId = ?,
			status = ?,
			healthScore = ?,
			minConfidenceThreshold = ?
		WHERE id = ?
	`).run(def.symbolId, def.status, def.healthScore, def.minConfidenceThreshold, def.id);
}

export function deleteSignDefinitionById(id: string): void {
	getDb().prepare("DELETE FROM signDefinitions WHERE id = ?").run(id);
}

function rowToSignDefinition(row: any): SignDefinition {
	return {
		id: row.id,
		symbolId: row.symbolId,
		status: row.status,
		healthScore: row.healthScore,
		minConfidenceThreshold: row.minConfidenceThreshold,
	};
}

// ==================== SIGN TRAINING DATA OPERATIONS ====================

export function getAllSignTrainingData(): SignTrainingData[] {
	const rows = getDb().prepare("SELECT * FROM signTrainingData").all() as any[];
	return rows.map(rowToSignTrainingData);
}

export function getSignTrainingDataById(id: string): SignTrainingData | undefined {
	const row = getDb().prepare("SELECT * FROM signTrainingData WHERE id = ?").get(id) as any;
	return row ? rowToSignTrainingData(row) : undefined;
}

export function insertSignTrainingData(data: SignTrainingData): void {
	getDb().prepare(`
		INSERT INTO signTrainingData (id, signId, landmarkData, source, syncStatus, approved)
		VALUES (?, ?, ?, ?, ?, ?)
	`).run(
		data.id,
		data.signId,
		JSON.stringify(data.landmarkData),
		data.source,
		data.syncStatus,
		data.approved ? 1 : 0,
	);
}

export function updateSignTrainingDataInDb(data: SignTrainingData): void {
	getDb().prepare(`
		UPDATE signTrainingData SET
			signId = ?,
			landmarkData = ?,
			source = ?,
			syncStatus = ?,
			approved = ?
		WHERE id = ?
	`).run(
		data.signId,
		JSON.stringify(data.landmarkData),
		data.source,
		data.syncStatus,
		data.approved ? 1 : 0,
		data.id,
	);
}

export function deleteSignTrainingDataById(id: string): void {
	getDb().prepare("DELETE FROM signTrainingData WHERE id = ?").run(id);
}

function rowToSignTrainingData(row: any): SignTrainingData {
	return {
		id: row.id,
		signId: row.signId,
		landmarkData: JSON.parse(row.landmarkData),
		source: row.source,
		syncStatus: row.syncStatus,
		approved: row.approved === 1,
	};
}

// ==================== INTERACTION LOG OPERATIONS ====================

export function getAllInteractionLogs(): InteractionLog[] {
	const rows = getDb().prepare("SELECT * FROM interactionLogs").all() as any[];
	return rows.map(rowToInteractionLog);
}

export function getInteractionLogById(id: string): InteractionLog | undefined {
	const row = getDb().prepare("SELECT * FROM interactionLogs WHERE id = ?").get(id) as any;
	return row ? rowToInteractionLog(row) : undefined;
}

export function insertInteractionLog(log: InteractionLog): void {
	getDb().prepare(`
		INSERT INTO interactionLogs (
			id, signId, wasSuccessful, confidenceScore, timestamp,
			caregiverOverrideId, processedBy
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`).run(
		log.id,
		log.signId,
		log.wasSuccessful ? 1 : 0,
		log.confidenceScore,
		log.timestamp,
		log.caregiverOverrideId ?? null,
		log.processedBy,
	);
}

export function updateInteractionLogInDb(log: InteractionLog): void {
	getDb().prepare(`
		UPDATE interactionLogs SET
			signId = ?,
			wasSuccessful = ?,
			confidenceScore = ?,
			timestamp = ?,
			caregiverOverrideId = ?,
			processedBy = ?
		WHERE id = ?
	`).run(
		log.signId,
		log.wasSuccessful ? 1 : 0,
		log.confidenceScore,
		log.timestamp,
		log.caregiverOverrideId ?? null,
		log.processedBy,
		log.id,
	);
}

export function deleteInteractionLogById(id: string): void {
	getDb().prepare("DELETE FROM interactionLogs WHERE id = ?").run(id);
}

function rowToInteractionLog(row: any): InteractionLog {
	return {
		id: row.id,
		signId: row.signId,
		wasSuccessful: row.wasSuccessful === 1,
		confidenceScore: row.confidenceScore,
		timestamp: row.timestamp,
		caregiverOverrideId: row.caregiverOverrideId ?? undefined,
		processedBy: row.processedBy,
	};
}

// ==================== VOCABULARY SET OPERATIONS ====================

export function getAllVocabularySets(): VocabularySet[] {
	const rows = getDb().prepare("SELECT * FROM vocabularySets").all() as any[];
	return rows.map((row: any) => ({ id: row.id, name: row.name }));
}

export function getVocabularySetById(id: string): VocabularySet | undefined {
	const row = getDb().prepare("SELECT * FROM vocabularySets WHERE id = ?").get(id) as any;
	return row ? { id: row.id, name: row.name } : undefined;
}

export function insertVocabularySet(set: VocabularySet): void {
	getDb().prepare("INSERT INTO vocabularySets (id, name) VALUES (?, ?)").run(set.id, set.name);
}

export function updateVocabularySetInDb(set: VocabularySet): void {
	getDb().prepare("UPDATE vocabularySets SET name = ? WHERE id = ?").run(set.name, set.id);
}

export function deleteVocabularySetById(id: string): void {
	getDb().prepare("DELETE FROM vocabularySets WHERE id = ?").run(id);
}

// ==================== VOCABULARY SET SYMBOL OPERATIONS ====================

export function getAllVocabularySetSymbols(): VocabularySetSymbol[] {
	const rows = getDb().prepare("SELECT * FROM vocabularySetSymbols").all() as any[];
	return rows.map((row: any) => ({
		id: row.id,
		vocabularySetId: row.vocabularySetId,
		symbolId: row.symbolId,
	}));
}

export function getVocabularySetSymbolById(id: string): VocabularySetSymbol | undefined {
	const row = getDb().prepare("SELECT * FROM vocabularySetSymbols WHERE id = ?").get(id) as any;
	return row ? { id: row.id, vocabularySetId: row.vocabularySetId, symbolId: row.symbolId } : undefined;
}

export function insertVocabularySetSymbol(link: VocabularySetSymbol): void {
	getDb().prepare(`
		INSERT INTO vocabularySetSymbols (id, vocabularySetId, symbolId)
		VALUES (?, ?, ?)
	`).run(link.id, link.vocabularySetId, link.symbolId);
}

export function updateVocabularySetSymbolInDb(link: VocabularySetSymbol): void {
	getDb().prepare(`
		UPDATE vocabularySetSymbols SET
			vocabularySetId = ?,
			symbolId = ?
		WHERE id = ?
	`).run(link.vocabularySetId, link.symbolId, link.id);
}

export function deleteVocabularySetSymbolById(id: string): void {
	getDb().prepare("DELETE FROM vocabularySetSymbols WHERE id = ?").run(id);
}

// ==================== USAGE STAT OPERATIONS ====================

export function getAllUsageStats(): UsageStat[] {
	const rows = getDb().prepare("SELECT * FROM usageStats").all() as any[];
	return rows.map((row: any) => ({
		id: row.id,
		symbolId: row.symbolId,
		profileId: row.profileId,
		count: row.count,
	}));
}

export function getUsageStatById(id: string): UsageStat | undefined {
	const row = getDb().prepare("SELECT * FROM usageStats WHERE id = ?").get(id) as any;
	return row ? { id: row.id, symbolId: row.symbolId, profileId: row.profileId, count: row.count } : undefined;
}

export function getUsageStatsByProfileId(profileId: string): UsageStat[] {
	const rows = getDb().prepare("SELECT * FROM usageStats WHERE profileId = ?").all(profileId) as any[];
	return rows.map((row: any) => ({
		id: row.id,
		symbolId: row.symbolId,
		profileId: row.profileId,
		count: row.count,
	}));
}

export function insertUsageStat(stat: UsageStat): void {
	getDb().prepare("INSERT INTO usageStats (id, symbolId, profileId, count) VALUES (?, ?, ?, ?)").run(
		stat.id,
		stat.symbolId,
		stat.profileId,
		stat.count,
	);
}

export function updateUsageStatInDb(stat: UsageStat): void {
	getDb().prepare("UPDATE usageStats SET symbolId = ?, profileId = ?, count = ? WHERE id = ?").run(
		stat.symbolId,
		stat.profileId,
		stat.count,
		stat.id,
	);
}

export function deleteUsageStatById(id: string): void {
	getDb().prepare("DELETE FROM usageStats WHERE id = ?").run(id);
}

export function deleteUsageStatsByProfileId(profileId: string): void {
	getDb().prepare("DELETE FROM usageStats WHERE profileId = ?").run(profileId);
}

// ==================== LEARNING ANALYTICS OPERATIONS ====================

export function getAllLearningAnalytics(): LearningAnalytics[] {
	const rows = getDb().prepare("SELECT * FROM learningAnalytics").all() as any[];
	return rows.map(rowToLearningAnalytics);
}

export function getLearningAnalyticsById(id: string): LearningAnalytics | undefined {
	const row = getDb().prepare("SELECT * FROM learningAnalytics WHERE id = ?").get(id) as any;
	return row ? rowToLearningAnalytics(row) : undefined;
}

export function insertLearningAnalytics(la: LearningAnalytics): void {
	getDb().prepare(`
		INSERT INTO learningAnalytics (
			id, signId, successRate24h, successRate7d, avgConfidenceScore,
			improvementTrend, lastCalculated
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`).run(
		la.id,
		la.signId,
		la.successRate24h,
		la.successRate7d,
		la.avgConfidenceScore,
		la.improvementTrend,
		la.lastCalculated,
	);
}

export function updateLearningAnalyticsInDb(la: LearningAnalytics): void {
	getDb().prepare(`
		UPDATE learningAnalytics SET
			signId = ?,
			successRate24h = ?,
			successRate7d = ?,
			avgConfidenceScore = ?,
			improvementTrend = ?,
			lastCalculated = ?
		WHERE id = ?
	`).run(
		la.signId,
		la.successRate24h,
		la.successRate7d,
		la.avgConfidenceScore,
		la.improvementTrend,
		la.lastCalculated,
		la.id,
	);
}

export function deleteLearningAnalyticsById(id: string): void {
	getDb().prepare("DELETE FROM learningAnalytics WHERE id = ?").run(id);
}

function rowToLearningAnalytics(row: any): LearningAnalytics {
	return {
		id: row.id,
		signId: row.signId,
		successRate24h: row.successRate24h,
		successRate7d: row.successRate7d,
		avgConfidenceScore: row.avgConfidenceScore,
		improvementTrend: row.improvementTrend,
		lastCalculated: row.lastCalculated,
	};
}

// ==================== CORRECTION OPERATIONS ====================

export function getAllCorrections(): Correction[] {
	const rows = getDb().prepare("SELECT * FROM corrections").all() as any[];
	return rows.map(rowToCorrection);
}

export function getCorrectionById(id: string): Correction | undefined {
	const row = getDb().prepare("SELECT * FROM corrections WHERE id = ?").get(id) as any;
	return row ? rowToCorrection(row) : undefined;
}

export function getCorrectionsByProfileId(profileId: string): Correction[] {
	const rows = getDb().prepare("SELECT * FROM corrections WHERE profileId = ?").all(profileId) as any[];
	return rows.map(rowToCorrection);
}

export function insertCorrection(corr: Correction): void {
	getDb().prepare(`
		INSERT INTO corrections (
			id, predictedSign, actualSign, confidence, timestamp, isSynced, profileId
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`).run(
		corr.id,
		corr.predictedSign,
		corr.actualSign,
		corr.confidence,
		corr.timestamp,
		corr.isSynced ? 1 : 0,
		corr.profileId ?? null,
	);
}

export function updateCorrectionInDb(corr: Correction): void {
	getDb().prepare(`
		UPDATE corrections SET
			predictedSign = ?,
			actualSign = ?,
			confidence = ?,
			timestamp = ?,
			isSynced = ?,
			profileId = ?
		WHERE id = ?
	`).run(
		corr.predictedSign,
		corr.actualSign,
		corr.confidence,
		corr.timestamp,
		corr.isSynced ? 1 : 0,
		corr.profileId ?? null,
		corr.id,
	);
}

export function deleteCorrectionById(id: string): void {
	getDb().prepare("DELETE FROM corrections WHERE id = ?").run(id);
}

export function deleteCorrectionsByProfileId(profileId: string): void {
	getDb().prepare("DELETE FROM corrections WHERE profileId = ?").run(profileId);
}

function rowToCorrection(row: any): Correction {
	return {
		id: row.id,
		predictedSign: row.predictedSign,
		actualSign: row.actualSign,
		confidence: row.confidence,
		timestamp: row.timestamp,
		isSynced: row.isSynced === 1,
		profileId: row.profileId ?? undefined,
	};
}

// ==================== NEGATIVE SAMPLE OPERATIONS ====================

export function getAllNegativeSamples(): NegativeSample[] {
	const rows = getDb().prepare("SELECT * FROM negativeSamples").all() as any[];
	return rows.map((row: any) => ({
		id: row.id,
		sign: row.sign,
		timestamp: row.timestamp,
	}));
}

export function getNegativeSampleById(id: string): NegativeSample | undefined {
	const row = getDb().prepare("SELECT * FROM negativeSamples WHERE id = ?").get(id) as any;
	return row ? { id: row.id, sign: row.sign, timestamp: row.timestamp } : undefined;
}

export function insertNegativeSample(sample: NegativeSample): void {
	getDb().prepare("INSERT INTO negativeSamples (id, sign, timestamp) VALUES (?, ?, ?)").run(
		sample.id,
		sample.sign,
		sample.timestamp,
	);
}

export function deleteNegativeSampleById(id: string): void {
	getDb().prepare("DELETE FROM negativeSamples WHERE id = ?").run(id);
}

// ==================== PROFILE DATA DELETION ====================

/**
 * Delete all data associated with a profile (GDPR compliance)
 */
export function deleteProfileDataFromSqlite(profileId: string): void {
	const database = getDb();
	const deleteInTransaction = database.transaction(() => {
		database.prepare("DELETE FROM profiles WHERE id = ?").run(profileId);
		database.prepare("DELETE FROM usageStats WHERE profileId = ?").run(profileId);
		database.prepare("DELETE FROM corrections WHERE profileId = ?").run(profileId);
		database.prepare("DELETE FROM symbols WHERE profileId = ?").run(profileId);
	});
	deleteInTransaction();
}

// ==================== LOAD FULL DATABASE ====================

/**
 * Load all data from SQLite into memory structure for API compatibility
 */
export function loadAllFromSqlite(): DatabaseType {
	return {
		symbols: getAllSymbols(),
		signDefinitions: getAllSignDefinitions(),
		signTrainingData: getAllSignTrainingData(),
		interactionLogs: getAllInteractionLogs(),
		profiles: getAllProfiles(),
		vocabularySets: getAllVocabularySets(),
		vocabularySetSymbols: getAllVocabularySetSymbols(),
		usageStats: getAllUsageStats(),
		learningAnalytics: getAllLearningAnalytics(),
		corrections: getAllCorrections(),
		negativeSamples: getAllNegativeSamples(),
		users: getAllUsers(),
	};
}
