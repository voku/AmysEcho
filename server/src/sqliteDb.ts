import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import Database from "better-sqlite3";
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

export interface Database {
	symbols: SymbolRecord[];
	signDefinitions: SignDefinition[];
	signTrainingData: SignTrainingData[];
	interactionLogs: InteractionLog[];
	profiles: Profile[];
	vocabularySets: VocabularySet[];
	vocabularySetSymbols: VocabularySetSymbol[];
	usageStats: UsageStat[];
	learningAnalytics: LearningAnalytics[];
	corrections: Correction[];
	negativeSamples: NegativeSample[];
	users: StoredUser[];
}

let db: Database.Database | null = null;
let currentDbPath: string | null = null;

const createSchema = (sqlite: Database.Database): void => {
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS symbols (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			emoji TEXT NOT NULL,
			color TEXT NOT NULL,
			category TEXT,
			imageUrl TEXT,
			audioUri TEXT NOT NULL,
			dgsVideoUri TEXT,
			healthScore REAL NOT NULL,
			profileId TEXT
		);
		
		CREATE INDEX IF NOT EXISTS idx_symbols_profileId ON symbols(profileId);
		
		CREATE TABLE IF NOT EXISTS signDefinitions (
			id TEXT PRIMARY KEY,
			symbolId TEXT NOT NULL,
			status TEXT NOT NULL,
			healthScore REAL NOT NULL,
			minConfidenceThreshold REAL NOT NULL
		);
		
		CREATE INDEX IF NOT EXISTS idx_signDefinitions_symbolId ON signDefinitions(symbolId);
		
		CREATE TABLE IF NOT EXISTS signTrainingData (
			id TEXT PRIMARY KEY,
			signId TEXT NOT NULL,
			landmarkData TEXT NOT NULL,
			source TEXT NOT NULL,
			syncStatus TEXT NOT NULL,
			approved INTEGER NOT NULL
		);
		
		CREATE INDEX IF NOT EXISTS idx_signTrainingData_signId ON signTrainingData(signId);
		CREATE INDEX IF NOT EXISTS idx_signTrainingData_syncStatus ON signTrainingData(syncStatus);
		
		CREATE TABLE IF NOT EXISTS interactionLogs (
			id TEXT PRIMARY KEY,
			signId TEXT NOT NULL,
			wasSuccessful INTEGER NOT NULL,
			confidenceScore REAL NOT NULL,
			timestamp INTEGER NOT NULL,
			caregiverOverrideId TEXT,
			processedBy TEXT NOT NULL
		);
		
		CREATE INDEX IF NOT EXISTS idx_interactionLogs_signId ON interactionLogs(signId);
		CREATE INDEX IF NOT EXISTS idx_interactionLogs_timestamp ON interactionLogs(timestamp);
		
		CREATE TABLE IF NOT EXISTS profiles (
			id TEXT PRIMARY KEY,
			userId TEXT NOT NULL,
			displayName TEXT NOT NULL,
			createdAt TEXT NOT NULL,
			metadata TEXT,
			consentDataUpload INTEGER NOT NULL,
			consentHelpMeGetSmarter INTEGER NOT NULL,
			vocabularySetId TEXT NOT NULL,
			largeText INTEGER,
			highContrast INTEGER
		);
		
		CREATE INDEX IF NOT EXISTS idx_profiles_userId ON profiles(userId);
		
		CREATE TABLE IF NOT EXISTS vocabularySets (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL
		);
		
		CREATE TABLE IF NOT EXISTS vocabularySetSymbols (
			id TEXT PRIMARY KEY,
			vocabularySetId TEXT NOT NULL,
			symbolId TEXT NOT NULL
		);
		
		CREATE INDEX IF NOT EXISTS idx_vocabularySetSymbols_vocabularySetId ON vocabularySetSymbols(vocabularySetId);
		CREATE INDEX IF NOT EXISTS idx_vocabularySetSymbols_symbolId ON vocabularySetSymbols(symbolId);
		
		CREATE TABLE IF NOT EXISTS usageStats (
			id TEXT PRIMARY KEY,
			symbolId TEXT NOT NULL,
			profileId TEXT NOT NULL,
			count INTEGER NOT NULL
		);
		
		CREATE INDEX IF NOT EXISTS idx_usageStats_symbolId ON usageStats(symbolId);
		CREATE INDEX IF NOT EXISTS idx_usageStats_profileId ON usageStats(profileId);
		
		CREATE TABLE IF NOT EXISTS learningAnalytics (
			id TEXT PRIMARY KEY,
			signId TEXT NOT NULL,
			successRate24h REAL NOT NULL,
			successRate7d REAL NOT NULL,
			avgConfidenceScore REAL NOT NULL,
			improvementTrend REAL NOT NULL,
			lastCalculated INTEGER NOT NULL
		);
		
		CREATE INDEX IF NOT EXISTS idx_learningAnalytics_signId ON learningAnalytics(signId);
		
		CREATE TABLE IF NOT EXISTS corrections (
			id TEXT PRIMARY KEY,
			predictedSign TEXT NOT NULL,
			actualSign TEXT NOT NULL,
			confidence REAL NOT NULL,
			timestamp INTEGER NOT NULL,
			isSynced INTEGER NOT NULL,
			profileId TEXT
		);
		
		CREATE INDEX IF NOT EXISTS idx_corrections_profileId ON corrections(profileId);
		CREATE INDEX IF NOT EXISTS idx_corrections_timestamp ON corrections(timestamp);
		
		CREATE TABLE IF NOT EXISTS negativeSamples (
			id TEXT PRIMARY KEY,
			sign TEXT NOT NULL,
			timestamp INTEGER NOT NULL
		);
		
		CREATE INDEX IF NOT EXISTS idx_negativeSamples_timestamp ON negativeSamples(timestamp);
		
		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			username TEXT NOT NULL UNIQUE COLLATE NOCASE,
			email TEXT NOT NULL UNIQUE COLLATE NOCASE,
			passwordHash TEXT NOT NULL,
			displayName TEXT,
			role TEXT NOT NULL,
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
};

const migrateFromJson = async (
	sqlite: Database.Database,
	jsonPath: string,
): Promise<void> => {
	console.log(`Checking for JSON database at ${jsonPath}...`);
	
	try {
		const data = await fs.readFile(jsonPath, "utf8");
		const jsonDb = JSON.parse(data) as Partial<Database>;
		
		console.log("JSON database found, migrating to SQLite...");
		
		const migrate = sqlite.transaction(() => {
			// Migrate symbols
			const insertSymbol = sqlite.prepare(`
				INSERT INTO symbols (id, name, emoji, color, category, imageUrl, audioUri, dgsVideoUri, healthScore, profileId)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);
			for (const symbol of jsonDb.symbols || []) {
				insertSymbol.run(
					symbol.id,
					symbol.name,
					symbol.emoji,
					symbol.color,
					symbol.category || null,
					symbol.imageUrl || null,
					symbol.audioUri,
					symbol.dgsVideoUri || null,
					symbol.healthScore,
					symbol.profileId || null,
				);
			}
			
			// Migrate signDefinitions
			const insertSignDefinition = sqlite.prepare(`
				INSERT INTO signDefinitions (id, symbolId, status, healthScore, minConfidenceThreshold)
				VALUES (?, ?, ?, ?, ?)
			`);
			for (const def of jsonDb.signDefinitions || []) {
				insertSignDefinition.run(
					def.id,
					def.symbolId,
					def.status,
					def.healthScore,
					def.minConfidenceThreshold,
				);
			}
			
			// Migrate signTrainingData
			const insertTrainingData = sqlite.prepare(`
				INSERT INTO signTrainingData (id, signId, landmarkData, source, syncStatus, approved)
				VALUES (?, ?, ?, ?, ?, ?)
			`);
			for (const data of jsonDb.signTrainingData || []) {
				insertTrainingData.run(
					data.id,
					data.signId,
					JSON.stringify(data.landmarkData),
					data.source,
					data.syncStatus,
					data.approved ? 1 : 0,
				);
			}
			
			// Migrate interactionLogs
			const insertLog = sqlite.prepare(`
				INSERT INTO interactionLogs (id, signId, wasSuccessful, confidenceScore, timestamp, caregiverOverrideId, processedBy)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			`);
			for (const log of jsonDb.interactionLogs || []) {
				insertLog.run(
					log.id,
					log.signId,
					log.wasSuccessful ? 1 : 0,
					log.confidenceScore,
					log.timestamp,
					log.caregiverOverrideId || null,
					log.processedBy,
				);
			}
			
			// Migrate profiles
			const insertProfile = sqlite.prepare(`
				INSERT INTO profiles (id, userId, displayName, createdAt, metadata, consentDataUpload, consentHelpMeGetSmarter, vocabularySetId, largeText, highContrast)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);
			for (const profile of jsonDb.profiles || []) {
				insertProfile.run(
					profile.id,
					profile.userId,
					profile.displayName,
					profile.createdAt,
					profile.metadata ? JSON.stringify(profile.metadata) : null,
					profile.consentDataUpload ? 1 : 0,
					profile.consentHelpMeGetSmarter ? 1 : 0,
					profile.vocabularySetId,
					profile.largeText ? 1 : 0,
					profile.highContrast ? 1 : 0,
				);
			}
			
			// Migrate vocabularySets
			const insertVocabSet = sqlite.prepare(`
				INSERT INTO vocabularySets (id, name)
				VALUES (?, ?)
			`);
			for (const set of jsonDb.vocabularySets || []) {
				insertVocabSet.run(set.id, set.name);
			}
			
			// Migrate vocabularySetSymbols
			const insertVocabSetSymbol = sqlite.prepare(`
				INSERT INTO vocabularySetSymbols (id, vocabularySetId, symbolId)
				VALUES (?, ?, ?)
			`);
			for (const link of jsonDb.vocabularySetSymbols || []) {
				insertVocabSetSymbol.run(link.id, link.vocabularySetId, link.symbolId);
			}
			
			// Migrate usageStats
			const insertUsageStat = sqlite.prepare(`
				INSERT INTO usageStats (id, symbolId, profileId, count)
				VALUES (?, ?, ?, ?)
			`);
			for (const stat of jsonDb.usageStats || []) {
				insertUsageStat.run(stat.id, stat.symbolId, stat.profileId, stat.count);
			}
			
			// Migrate learningAnalytics
			const insertLearningAnalytics = sqlite.prepare(`
				INSERT INTO learningAnalytics (id, signId, successRate24h, successRate7d, avgConfidenceScore, improvementTrend, lastCalculated)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			`);
			for (const la of jsonDb.learningAnalytics || []) {
				insertLearningAnalytics.run(
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
			const insertCorrection = sqlite.prepare(`
				INSERT INTO corrections (id, predictedSign, actualSign, confidence, timestamp, isSynced, profileId)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			`);
			for (const correction of jsonDb.corrections || []) {
				insertCorrection.run(
					correction.id,
					correction.predictedSign,
					correction.actualSign,
					correction.confidence,
					correction.timestamp,
					correction.isSynced ? 1 : 0,
					correction.profileId || null,
				);
			}
			
			// Migrate negativeSamples
			const insertNegativeSample = sqlite.prepare(`
				INSERT INTO negativeSamples (id, sign, timestamp)
				VALUES (?, ?, ?)
			`);
			for (const sample of jsonDb.negativeSamples || []) {
				insertNegativeSample.run(sample.id, sample.sign, sample.timestamp);
			}
			
			// Migrate users
			const insertUser = sqlite.prepare(`
				INSERT INTO users (id, username, email, passwordHash, displayName, role, createdAt, emailVerifiedAt, emailVerificationTokenHash, emailVerificationExpiresAt, emailVerificationSentAt, passwordResetTokenHash, passwordResetExpiresAt, passwordResetRequestedAt)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);
			for (const user of jsonDb.users || []) {
				insertUser.run(
					user.id,
					user.username.trim().toLowerCase(),
					user.email.trim().toLowerCase(),
					user.passwordHash,
					user.displayName || null,
					user.role,
					user.createdAt,
					user.emailVerifiedAt || null,
					user.emailVerificationTokenHash || null,
					user.emailVerificationExpiresAt || null,
					user.emailVerificationSentAt || null,
					user.passwordResetTokenHash || null,
					user.passwordResetExpiresAt || null,
					user.passwordResetRequestedAt || null,
				);
			}
		});
		
		migrate();
		
		// Backup the JSON file
		const backupPath = `${jsonPath}.migrated.backup`;
		await fs.copyFile(jsonPath, backupPath);
		console.log(`JSON database migrated successfully. Backup saved to ${backupPath}`);
	} catch (error: any) {
		if (error?.code === "ENOENT") {
			console.log("No JSON database found, starting fresh");
		} else {
			throw error;
		}
	}
};

export const initializeDatabase = async (
	dbPath: string,
	jsonPath?: string,
): Promise<void> => {
	// If already initialized with the same path, skip
	if (db && currentDbPath === dbPath) {
		return;
	}
	
	// Close existing connection if we're switching databases
	if (db && currentDbPath !== dbPath) {
		db.close();
		db = null;
	}
	
	// Ensure directory exists
	await fs.mkdir(path.dirname(dbPath), { recursive: true });
	
	db = new Database(dbPath);
	currentDbPath = dbPath;
	db.pragma("journal_mode = WAL");
	db.pragma("foreign_keys = ON");
	
	createSchema(db);
	
	// Check if database is empty and migrate from JSON if available
	const count = db.prepare("SELECT COUNT(*) as count FROM symbols").get() as { count: number };
	if (count.count === 0 && jsonPath) {
		await migrateFromJson(db, jsonPath);
	}
};

export const createDatabase = (): Database => ({
	symbols: [],
	signDefinitions: [],
	signTrainingData: [],
	interactionLogs: [],
	profiles: [],
	vocabularySets: [],
	vocabularySetSymbols: [],
	usageStats: [],
	learningAnalytics: [],
	corrections: [],
	negativeSamples: [],
	users: [],
});

// Helper to get database instance
const getDb = (): Database.Database => {
	if (!db) {
		throw new Error("Database not initialized. Call initializeDatabase() first.");
	}
	return db;
};

// For testing: close and reset the database connection
export const closeDatabase = (): void => {
	if (db) {
		db.close();
		db = null;
		currentDbPath = null;
	}
};

// Symbol operations
export const addSymbol = (_db: Database, symbol: SymbolRecord): void => {
	const sqlite = getDb();
	const stmt = sqlite.prepare(`
		INSERT INTO symbols (id, name, emoji, color, category, imageUrl, audioUri, dgsVideoUri, healthScore, profileId)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	stmt.run(
		symbol.id,
		symbol.name,
		symbol.emoji,
		symbol.color,
		symbol.category || null,
		symbol.imageUrl || null,
		symbol.audioUri,
		symbol.dgsVideoUri || null,
		symbol.healthScore,
		symbol.profileId || null,
	);
};

export const updateSymbol = (_db: Database, symbol: SymbolRecord): void => {
	const sqlite = getDb();
	const stmt = sqlite.prepare(`
		UPDATE symbols
		SET name = ?, emoji = ?, color = ?, category = ?, imageUrl = ?, audioUri = ?, dgsVideoUri = ?, healthScore = ?, profileId = ?
		WHERE id = ?
	`);
	stmt.run(
		symbol.name,
		symbol.emoji,
		symbol.color,
		symbol.category || null,
		symbol.imageUrl || null,
		symbol.audioUri,
		symbol.dgsVideoUri || null,
		symbol.healthScore,
		symbol.profileId || null,
		symbol.id,
	);
};

export const removeSymbol = (_db: Database, id: string): void => {
	const sqlite = getDb();
	sqlite.prepare("DELETE FROM symbols WHERE id = ?").run(id);
};

export const getSymbolById = (
	_db: Database,
	id: string,
): SymbolRecord | undefined => {
	const sqlite = getDb();
	const row = sqlite.prepare("SELECT * FROM symbols WHERE id = ?").get(id) as any;
	if (!row) return undefined;
	return {
		id: row.id,
		name: row.name,
		emoji: row.emoji,
		color: row.color,
		category: row.category || undefined,
		imageUrl: row.imageUrl || undefined,
		audioUri: row.audioUri,
		dgsVideoUri: row.dgsVideoUri || undefined,
		healthScore: row.healthScore,
		profileId: row.profileId || undefined,
	};
};

// SignDefinition operations
export const addSignDefinition = (_db: Database, def: SignDefinition): void => {
	const sqlite = getDb();
	const stmt = sqlite.prepare(`
		INSERT INTO signDefinitions (id, symbolId, status, healthScore, minConfidenceThreshold)
		VALUES (?, ?, ?, ?, ?)
	`);
	stmt.run(def.id, def.symbolId, def.status, def.healthScore, def.minConfidenceThreshold);
};

export const updateSignDefinition = (_db: Database, def: SignDefinition): void => {
	const sqlite = getDb();
	const stmt = sqlite.prepare(`
		UPDATE signDefinitions
		SET symbolId = ?, status = ?, healthScore = ?, minConfidenceThreshold = ?
		WHERE id = ?
	`);
	stmt.run(def.symbolId, def.status, def.healthScore, def.minConfidenceThreshold, def.id);
};

export const removeSignDefinition = (_db: Database, id: string): void => {
	const sqlite = getDb();
	sqlite.prepare("DELETE FROM signDefinitions WHERE id = ?").run(id);
};

export const getSignDefinitionById = (
	_db: Database,
	id: string,
): SignDefinition | undefined => {
	const sqlite = getDb();
	const row = sqlite.prepare("SELECT * FROM signDefinitions WHERE id = ?").get(id) as any;
	if (!row) return undefined;
	return {
		id: row.id,
		symbolId: row.symbolId,
		status: row.status,
		healthScore: row.healthScore,
		minConfidenceThreshold: row.minConfidenceThreshold,
	};
};

// SignTrainingData operations
export const addSignTrainingData = (
	_db: Database,
	data: SignTrainingData,
): void => {
	const sqlite = getDb();
	const stmt = sqlite.prepare(`
		INSERT INTO signTrainingData (id, signId, landmarkData, source, syncStatus, approved)
		VALUES (?, ?, ?, ?, ?, ?)
	`);
	stmt.run(
		data.id,
		data.signId,
		JSON.stringify(data.landmarkData),
		data.source,
		data.syncStatus,
		data.approved ? 1 : 0,
	);
};

export const updateSignTrainingData = (
	_db: Database,
	data: SignTrainingData,
): void => {
	const sqlite = getDb();
	const stmt = sqlite.prepare(`
		UPDATE signTrainingData
		SET signId = ?, landmarkData = ?, source = ?, syncStatus = ?, approved = ?
		WHERE id = ?
	`);
	stmt.run(
		data.signId,
		JSON.stringify(data.landmarkData),
		data.source,
		data.syncStatus,
		data.approved ? 1 : 0,
		data.id,
	);
};

export const removeSignTrainingData = (_db: Database, id: string): void => {
	const sqlite = getDb();
	sqlite.prepare("DELETE FROM signTrainingData WHERE id = ?").run(id);
};

export const getSignTrainingDataById = (
	_db: Database,
	id: string,
): SignTrainingData | undefined => {
	const sqlite = getDb();
	const row = sqlite.prepare("SELECT * FROM signTrainingData WHERE id = ?").get(id) as any;
	if (!row) return undefined;
	return {
		id: row.id,
		signId: row.signId,
		landmarkData: JSON.parse(row.landmarkData),
		source: row.source,
		syncStatus: row.syncStatus,
		approved: row.approved === 1,
	};
};

// InteractionLog operations
export const addInteractionLog = (_db: Database, log: InteractionLog): void => {
	const sqlite = getDb();
	const stmt = sqlite.prepare(`
		INSERT INTO interactionLogs (id, signId, wasSuccessful, confidenceScore, timestamp, caregiverOverrideId, processedBy)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`);
	stmt.run(
		log.id,
		log.signId,
		log.wasSuccessful ? 1 : 0,
		log.confidenceScore,
		log.timestamp,
		log.caregiverOverrideId || null,
		log.processedBy,
	);
};

export const updateInteractionLog = (_db: Database, log: InteractionLog): void => {
	const sqlite = getDb();
	const stmt = sqlite.prepare(`
		UPDATE interactionLogs
		SET signId = ?, wasSuccessful = ?, confidenceScore = ?, timestamp = ?, caregiverOverrideId = ?, processedBy = ?
		WHERE id = ?
	`);
	stmt.run(
		log.signId,
		log.wasSuccessful ? 1 : 0,
		log.confidenceScore,
		log.timestamp,
		log.caregiverOverrideId || null,
		log.processedBy,
		log.id,
	);
};

export const removeInteractionLog = (_db: Database, id: string): void => {
	const sqlite = getDb();
	sqlite.prepare("DELETE FROM interactionLogs WHERE id = ?").run(id);
};

export const getInteractionLogById = (
	_db: Database,
	id: string,
): InteractionLog | undefined => {
	const sqlite = getDb();
	const row = sqlite.prepare("SELECT * FROM interactionLogs WHERE id = ?").get(id) as any;
	if (!row) return undefined;
	return {
		id: row.id,
		signId: row.signId,
		wasSuccessful: row.wasSuccessful === 1,
		confidenceScore: row.confidenceScore,
		timestamp: row.timestamp,
		caregiverOverrideId: row.caregiverOverrideId || undefined,
		processedBy: row.processedBy,
	};
};

// Profile operations
export const addProfile = (_db: Database, profile: Profile): void => {
	const sqlite = getDb();
	const stmt = sqlite.prepare(`
		INSERT INTO profiles (id, userId, displayName, createdAt, metadata, consentDataUpload, consentHelpMeGetSmarter, vocabularySetId, largeText, highContrast)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	stmt.run(
		profile.id,
		profile.userId,
		profile.displayName,
		profile.createdAt,
		profile.metadata ? JSON.stringify(profile.metadata) : null,
		profile.consentDataUpload ? 1 : 0,
		profile.consentHelpMeGetSmarter ? 1 : 0,
		profile.vocabularySetId,
		profile.largeText ? 1 : 0,
		profile.highContrast ? 1 : 0,
	);
};

export const updateProfile = (_db: Database, profile: Profile): void => {
	const sqlite = getDb();
	const stmt = sqlite.prepare(`
		UPDATE profiles
		SET userId = ?, displayName = ?, createdAt = ?, metadata = ?, consentDataUpload = ?, consentHelpMeGetSmarter = ?, vocabularySetId = ?, largeText = ?, highContrast = ?
		WHERE id = ?
	`);
	stmt.run(
		profile.userId,
		profile.displayName,
		profile.createdAt,
		profile.metadata ? JSON.stringify(profile.metadata) : null,
		profile.consentDataUpload ? 1 : 0,
		profile.consentHelpMeGetSmarter ? 1 : 0,
		profile.vocabularySetId,
		profile.largeText ? 1 : 0,
		profile.highContrast ? 1 : 0,
		profile.id,
	);
};

export const removeProfile = (_db: Database, id: string): void => {
	const sqlite = getDb();
	sqlite.prepare("DELETE FROM profiles WHERE id = ?").run(id);
};

export const getProfileById = (_db: Database, id: string): Profile | undefined => {
	const sqlite = getDb();
	const row = sqlite.prepare("SELECT * FROM profiles WHERE id = ?").get(id) as any;
	if (!row) return undefined;
	return {
		id: row.id,
		userId: row.userId,
		displayName: row.displayName,
		createdAt: row.createdAt,
		metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
		consentDataUpload: row.consentDataUpload === 1,
		consentHelpMeGetSmarter: row.consentHelpMeGetSmarter === 1,
		vocabularySetId: row.vocabularySetId,
		largeText: row.largeText === 1 || undefined,
		highContrast: row.highContrast === 1 || undefined,
	};
};

// VocabularySet operations
export const addVocabularySet = (_db: Database, set: VocabularySet): void => {
	const sqlite = getDb();
	const stmt = sqlite.prepare(`
		INSERT INTO vocabularySets (id, name)
		VALUES (?, ?)
	`);
	stmt.run(set.id, set.name);
};

export const updateVocabularySet = (_db: Database, set: VocabularySet): void => {
	const sqlite = getDb();
	const stmt = sqlite.prepare(`
		UPDATE vocabularySets
		SET name = ?
		WHERE id = ?
	`);
	stmt.run(set.name, set.id);
};

export const removeVocabularySet = (_db: Database, id: string): void => {
	const sqlite = getDb();
	sqlite.prepare("DELETE FROM vocabularySets WHERE id = ?").run(id);
};

export const getVocabularySetById = (
	_db: Database,
	id: string,
): VocabularySet | undefined => {
	const sqlite = getDb();
	const row = sqlite.prepare("SELECT * FROM vocabularySets WHERE id = ?").get(id) as any;
	if (!row) return undefined;
	return {
		id: row.id,
		name: row.name,
	};
};

// VocabularySetSymbol operations
export const addVocabularySetSymbol = (
	_db: Database,
	link: VocabularySetSymbol,
): void => {
	const sqlite = getDb();
	const stmt = sqlite.prepare(`
		INSERT INTO vocabularySetSymbols (id, vocabularySetId, symbolId)
		VALUES (?, ?, ?)
	`);
	stmt.run(link.id, link.vocabularySetId, link.symbolId);
};

export const updateVocabularySetSymbol = (
	_db: Database,
	link: VocabularySetSymbol,
): void => {
	const sqlite = getDb();
	const stmt = sqlite.prepare(`
		UPDATE vocabularySetSymbols
		SET vocabularySetId = ?, symbolId = ?
		WHERE id = ?
	`);
	stmt.run(link.vocabularySetId, link.symbolId, link.id);
};

export const removeVocabularySetSymbol = (_db: Database, id: string): void => {
	const sqlite = getDb();
	sqlite.prepare("DELETE FROM vocabularySetSymbols WHERE id = ?").run(id);
};

export const getVocabularySetSymbolById = (
	_db: Database,
	id: string,
): VocabularySetSymbol | undefined => {
	const sqlite = getDb();
	const row = sqlite.prepare("SELECT * FROM vocabularySetSymbols WHERE id = ?").get(id) as any;
	if (!row) return undefined;
	return {
		id: row.id,
		vocabularySetId: row.vocabularySetId,
		symbolId: row.symbolId,
	};
};

// UsageStat operations
export const addUsageStat = (_db: Database, stat: UsageStat): void => {
	const sqlite = getDb();
	const stmt = sqlite.prepare(`
		INSERT INTO usageStats (id, symbolId, profileId, count)
		VALUES (?, ?, ?, ?)
	`);
	stmt.run(stat.id, stat.symbolId, stat.profileId, stat.count);
};

export const updateUsageStat = (_db: Database, stat: UsageStat): void => {
	const sqlite = getDb();
	const stmt = sqlite.prepare(`
		UPDATE usageStats
		SET symbolId = ?, profileId = ?, count = ?
		WHERE id = ?
	`);
	stmt.run(stat.symbolId, stat.profileId, stat.count, stat.id);
};

export const removeUsageStat = (_db: Database, id: string): void => {
	const sqlite = getDb();
	sqlite.prepare("DELETE FROM usageStats WHERE id = ?").run(id);
};

export const getUsageStatById = (
	_db: Database,
	id: string,
): UsageStat | undefined => {
	const sqlite = getDb();
	const row = sqlite.prepare("SELECT * FROM usageStats WHERE id = ?").get(id) as any;
	if (!row) return undefined;
	return {
		id: row.id,
		symbolId: row.symbolId,
		profileId: row.profileId,
		count: row.count,
	};
};

// LearningAnalytics operations
export const addLearningAnalytics = (
	_db: Database,
	la: LearningAnalytics,
): void => {
	const sqlite = getDb();
	const stmt = sqlite.prepare(`
		INSERT INTO learningAnalytics (id, signId, successRate24h, successRate7d, avgConfidenceScore, improvementTrend, lastCalculated)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`);
	stmt.run(
		la.id,
		la.signId,
		la.successRate24h,
		la.successRate7d,
		la.avgConfidenceScore,
		la.improvementTrend,
		la.lastCalculated,
	);
};

export const updateLearningAnalytics = (
	_db: Database,
	la: LearningAnalytics,
): void => {
	const sqlite = getDb();
	const stmt = sqlite.prepare(`
		UPDATE learningAnalytics
		SET signId = ?, successRate24h = ?, successRate7d = ?, avgConfidenceScore = ?, improvementTrend = ?, lastCalculated = ?
		WHERE id = ?
	`);
	stmt.run(
		la.signId,
		la.successRate24h,
		la.successRate7d,
		la.avgConfidenceScore,
		la.improvementTrend,
		la.lastCalculated,
		la.id,
	);
};

export const removeLearningAnalytics = (_db: Database, id: string): void => {
	const sqlite = getDb();
	sqlite.prepare("DELETE FROM learningAnalytics WHERE id = ?").run(id);
};

export const getLearningAnalyticsById = (
	_db: Database,
	id: string,
): LearningAnalytics | undefined => {
	const sqlite = getDb();
	const row = sqlite.prepare("SELECT * FROM learningAnalytics WHERE id = ?").get(id) as any;
	if (!row) return undefined;
	return {
		id: row.id,
		signId: row.signId,
		successRate24h: row.successRate24h,
		successRate7d: row.successRate7d,
		avgConfidenceScore: row.avgConfidenceScore,
		improvementTrend: row.improvementTrend,
		lastCalculated: row.lastCalculated,
	};
};

// NegativeSample operations
export const addNegativeSample = (
	_db: Database,
	sample: NegativeSample,
): void => {
	const sqlite = getDb();
	const stmt = sqlite.prepare(`
		INSERT INTO negativeSamples (id, sign, timestamp)
		VALUES (?, ?, ?)
	`);
	stmt.run(sample.id, sample.sign, sample.timestamp);
};

// User operations
export const addUser = (_db: Database, user: StoredUser): void => {
	const sqlite = getDb();
	
	// Security: Enforce username and email uniqueness at database layer
	const existingUsername = findUserByUsername(_db, user.username);
	if (existingUsername) {
		throw new Error("Username already exists");
	}
	
	const existingEmail = findUserByEmail(_db, user.email);
	if (existingEmail) {
		throw new Error("Email already exists");
	}
	
	const stmt = sqlite.prepare(`
		INSERT INTO users (id, username, email, passwordHash, displayName, role, createdAt, emailVerifiedAt, emailVerificationTokenHash, emailVerificationExpiresAt, emailVerificationSentAt, passwordResetTokenHash, passwordResetExpiresAt, passwordResetRequestedAt)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	stmt.run(
		user.id,
		user.username.trim().toLowerCase(),
		user.email.trim().toLowerCase(),
		user.passwordHash,
		user.displayName || null,
		user.role,
		user.createdAt,
		user.emailVerifiedAt || null,
		user.emailVerificationTokenHash || null,
		user.emailVerificationExpiresAt || null,
		user.emailVerificationSentAt || null,
		user.passwordResetTokenHash || null,
		user.passwordResetExpiresAt || null,
		user.passwordResetRequestedAt || null,
	);
};

export const findUserByUsername = (
	_db: Database,
	username: string,
): StoredUser | undefined => {
	const sqlite = getDb();
	const normalized = username.trim().toLowerCase();
	const row = sqlite.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(normalized) as any;
	if (!row) return undefined;
	return {
		id: row.id,
		username: row.username,
		email: row.email,
		passwordHash: row.passwordHash,
		displayName: row.displayName || undefined,
		role: row.role,
		createdAt: row.createdAt,
		emailVerifiedAt: row.emailVerifiedAt || undefined,
		emailVerificationTokenHash: row.emailVerificationTokenHash || undefined,
		emailVerificationExpiresAt: row.emailVerificationExpiresAt || undefined,
		emailVerificationSentAt: row.emailVerificationSentAt || undefined,
		passwordResetTokenHash: row.passwordResetTokenHash || undefined,
		passwordResetExpiresAt: row.passwordResetExpiresAt || undefined,
		passwordResetRequestedAt: row.passwordResetRequestedAt || undefined,
	};
};

export const findUserByEmail = (
	_db: Database,
	email: string,
): StoredUser | undefined => {
	const sqlite = getDb();
	const normalized = email.trim().toLowerCase();
	const row = sqlite.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(normalized) as any;
	if (!row) return undefined;
	return {
		id: row.id,
		username: row.username,
		email: row.email,
		passwordHash: row.passwordHash,
		displayName: row.displayName || undefined,
		role: row.role,
		createdAt: row.createdAt,
		emailVerifiedAt: row.emailVerifiedAt || undefined,
		emailVerificationTokenHash: row.emailVerificationTokenHash || undefined,
		emailVerificationExpiresAt: row.emailVerificationExpiresAt || undefined,
		emailVerificationSentAt: row.emailVerificationSentAt || undefined,
		passwordResetTokenHash: row.passwordResetTokenHash || undefined,
		passwordResetExpiresAt: row.passwordResetExpiresAt || undefined,
		passwordResetRequestedAt: row.passwordResetRequestedAt || undefined,
	};
};

export const findUserById = (
	_db: Database,
	id: string,
): StoredUser | undefined => {
	const sqlite = getDb();
	const row = sqlite.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
	if (!row) return undefined;
	return {
		id: row.id,
		username: row.username,
		email: row.email,
		passwordHash: row.passwordHash,
		displayName: row.displayName || undefined,
		role: row.role,
		createdAt: row.createdAt,
		emailVerifiedAt: row.emailVerifiedAt || undefined,
		emailVerificationTokenHash: row.emailVerificationTokenHash || undefined,
		emailVerificationExpiresAt: row.emailVerificationExpiresAt || undefined,
		emailVerificationSentAt: row.emailVerificationSentAt || undefined,
		passwordResetTokenHash: row.passwordResetTokenHash || undefined,
		passwordResetExpiresAt: row.passwordResetExpiresAt || undefined,
		passwordResetRequestedAt: row.passwordResetRequestedAt || undefined,
	};
};

export const updateUser = (_db: Database, user: StoredUser): void => {
	const sqlite = getDb();
	const stmt = sqlite.prepare(`
		UPDATE users
		SET username = ?, email = ?, passwordHash = ?, displayName = ?, role = ?,
		    createdAt = ?, emailVerifiedAt = ?, emailVerificationTokenHash = ?,
		    emailVerificationExpiresAt = ?, emailVerificationSentAt = ?,
		    passwordResetTokenHash = ?, passwordResetExpiresAt = ?, passwordResetRequestedAt = ?
		WHERE id = ?
	`);
	stmt.run(
		user.username.trim().toLowerCase(),
		user.email.trim().toLowerCase(),
		user.passwordHash,
		user.displayName || null,
		user.role,
		user.createdAt,
		user.emailVerifiedAt || null,
		user.emailVerificationTokenHash || null,
		user.emailVerificationExpiresAt || null,
		user.emailVerificationSentAt || null,
		user.passwordResetTokenHash || null,
		user.passwordResetExpiresAt || null,
		user.passwordResetRequestedAt || null,
		user.id,
	);
};

// Database I/O operations
export const saveDatabase = async (
	_db: Database,
	_filePath: string,
): Promise<void> => {
	// No-op for SQLite - auto-persists
	// Could optionally do a checkpoint here if needed
};

export const loadDatabase = async (filePath: string): Promise<Database> => {
	// If the requested path is different from current, switch to it
	if (currentDbPath !== filePath) {
		await initializeDatabase(filePath);
	}
	
	const sqlite = getDb();
	
	const symbols = sqlite.prepare("SELECT * FROM symbols").all() as any[];
	const signDefinitions = sqlite.prepare("SELECT * FROM signDefinitions").all() as any[];
	const signTrainingData = sqlite.prepare("SELECT * FROM signTrainingData").all() as any[];
	const interactionLogs = sqlite.prepare("SELECT * FROM interactionLogs").all() as any[];
	const profiles = sqlite.prepare("SELECT * FROM profiles").all() as any[];
	const vocabularySets = sqlite.prepare("SELECT * FROM vocabularySets").all() as any[];
	const vocabularySetSymbols = sqlite.prepare("SELECT * FROM vocabularySetSymbols").all() as any[];
	const usageStats = sqlite.prepare("SELECT * FROM usageStats").all() as any[];
	const learningAnalytics = sqlite.prepare("SELECT * FROM learningAnalytics").all() as any[];
	const corrections = sqlite.prepare("SELECT * FROM corrections").all() as any[];
	const negativeSamples = sqlite.prepare("SELECT * FROM negativeSamples").all() as any[];
	const users = sqlite.prepare("SELECT * FROM users").all() as any[];
	
	return {
		symbols: symbols.map(row => ({
			id: row.id,
			name: row.name,
			emoji: row.emoji,
			color: row.color,
			category: row.category || undefined,
			imageUrl: row.imageUrl || undefined,
			audioUri: row.audioUri,
			dgsVideoUri: row.dgsVideoUri || undefined,
			healthScore: row.healthScore,
			profileId: row.profileId || undefined,
		})),
		signDefinitions: signDefinitions.map(row => ({
			id: row.id,
			symbolId: row.symbolId,
			status: row.status,
			healthScore: row.healthScore,
			minConfidenceThreshold: row.minConfidenceThreshold,
		})),
		signTrainingData: signTrainingData.map(row => ({
			id: row.id,
			signId: row.signId,
			landmarkData: JSON.parse(row.landmarkData),
			source: row.source,
			syncStatus: row.syncStatus,
			approved: row.approved === 1,
		})),
		interactionLogs: interactionLogs.map(row => ({
			id: row.id,
			signId: row.signId,
			wasSuccessful: row.wasSuccessful === 1,
			confidenceScore: row.confidenceScore,
			timestamp: row.timestamp,
			caregiverOverrideId: row.caregiverOverrideId || undefined,
			processedBy: row.processedBy,
		})),
		profiles: profiles.map(row => ({
			id: row.id,
			userId: row.userId,
			displayName: row.displayName,
			createdAt: row.createdAt,
			metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
			consentDataUpload: row.consentDataUpload === 1,
			consentHelpMeGetSmarter: row.consentHelpMeGetSmarter === 1,
			vocabularySetId: row.vocabularySetId,
			largeText: row.largeText === 1 || undefined,
			highContrast: row.highContrast === 1 || undefined,
		})),
		vocabularySets: vocabularySets.map(row => ({
			id: row.id,
			name: row.name,
		})),
		vocabularySetSymbols: vocabularySetSymbols.map(row => ({
			id: row.id,
			vocabularySetId: row.vocabularySetId,
			symbolId: row.symbolId,
		})),
		usageStats: usageStats.map(row => ({
			id: row.id,
			symbolId: row.symbolId,
			profileId: row.profileId,
			count: row.count,
		})),
		learningAnalytics: learningAnalytics.map(row => ({
			id: row.id,
			signId: row.signId,
			successRate24h: row.successRate24h,
			successRate7d: row.successRate7d,
			avgConfidenceScore: row.avgConfidenceScore,
			improvementTrend: row.improvementTrend,
			lastCalculated: row.lastCalculated,
		})),
		corrections: corrections.map(row => ({
			id: row.id,
			predictedSign: row.predictedSign,
			actualSign: row.actualSign,
			confidence: row.confidence,
			timestamp: row.timestamp,
			isSynced: row.isSynced === 1,
			profileId: row.profileId || undefined,
		})),
		negativeSamples: negativeSamples.map(row => ({
			id: row.id,
			sign: row.sign,
			timestamp: row.timestamp,
		})),
		users: users.map(row => ({
			id: row.id,
			username: row.username,
			email: row.email,
			passwordHash: row.passwordHash,
			displayName: row.displayName || undefined,
			role: row.role,
			createdAt: row.createdAt,
			emailVerifiedAt: row.emailVerifiedAt || undefined,
			emailVerificationTokenHash: row.emailVerificationTokenHash || undefined,
			emailVerificationExpiresAt: row.emailVerificationExpiresAt || undefined,
			emailVerificationSentAt: row.emailVerificationSentAt || undefined,
			passwordResetTokenHash: row.passwordResetTokenHash || undefined,
			passwordResetExpiresAt: row.passwordResetExpiresAt || undefined,
			passwordResetRequestedAt: row.passwordResetRequestedAt || undefined,
		})),
	};
};

// Utility to create a cryptographically secure unique id
const generateId = (): string => randomBytes(16).toString("hex");

export const seedProfileSymbols = (_db: Database, profileId: string): void => {
	const sqlite = getDb();
	
	// Get all global symbols (profileId is null)
	const globalSymbols = sqlite.prepare("SELECT * FROM symbols WHERE profileId IS NULL").all() as any[];
	
	const insert = sqlite.prepare(`
		INSERT OR IGNORE INTO symbols (id, name, emoji, color, category, imageUrl, audioUri, dgsVideoUri, healthScore, profileId)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	
	const seedTransaction = sqlite.transaction(() => {
		for (const globalSymbol of globalSymbols) {
			const profileSymbolId = `${globalSymbol.id}-${profileId}`;
			insert.run(
				profileSymbolId,
				globalSymbol.name,
				globalSymbol.emoji,
				globalSymbol.color,
				globalSymbol.category || null,
				globalSymbol.imageUrl || null,
				globalSymbol.audioUri,
				globalSymbol.dgsVideoUri || null,
				globalSymbol.healthScore,
				profileId,
			);
		}
	});
	
	seedTransaction();
};

export const persistProfile = async (
	_db: Database,
	profile: Profile,
	_filePath: string,
): Promise<void> => {
	const sqlite = getDb();
	const existing = sqlite.prepare("SELECT id FROM profiles WHERE id = ?").get(profile.id);
	
	if (existing) {
		updateProfile(_db, profile);
	} else {
		addProfile(_db, profile);
	}
	// No need to save - SQLite auto-persists
};

export const getProfileData = (_db: Database, profileId: string) => {
	const sqlite = getDb();
	
	const profile = sqlite.prepare("SELECT * FROM profiles WHERE id = ?").get(profileId) as any;
	const usageStats = sqlite.prepare("SELECT * FROM usageStats WHERE profileId = ?").all(profileId) as any[];
	const corrections = sqlite.prepare("SELECT * FROM corrections WHERE profileId = ?").all(profileId) as any[];
	
	return {
		profile: profile ? {
			id: profile.id,
			userId: profile.userId,
			displayName: profile.displayName,
			createdAt: profile.createdAt,
			metadata: profile.metadata ? JSON.parse(profile.metadata) : undefined,
			consentDataUpload: profile.consentDataUpload === 1,
			consentHelpMeGetSmarter: profile.consentHelpMeGetSmarter === 1,
			vocabularySetId: profile.vocabularySetId,
			largeText: profile.largeText === 1 || undefined,
			highContrast: profile.highContrast === 1 || undefined,
		} : null,
		usageStats: usageStats.map(row => ({
			id: row.id,
			symbolId: row.symbolId,
			profileId: row.profileId,
			count: row.count,
		})),
		corrections: corrections.map(row => ({
			id: row.id,
			predictedSign: row.predictedSign,
			actualSign: row.actualSign,
			confidence: row.confidence,
			timestamp: row.timestamp,
			isSynced: row.isSynced === 1,
			profileId: row.profileId || undefined,
		})),
	};
};

export const deleteProfileData = async (
	_db: Database,
	profileId: string,
	_filePath: string,
): Promise<void> => {
	const sqlite = getDb();
	
	const deleteTransaction = sqlite.transaction(() => {
		sqlite.prepare("DELETE FROM profiles WHERE id = ?").run(profileId);
		sqlite.prepare("DELETE FROM usageStats WHERE profileId = ?").run(profileId);
		sqlite.prepare("DELETE FROM corrections WHERE profileId = ?").run(profileId);
	});
	
	deleteTransaction();
};

export const logCorrection = (
	_db: Database,
	predictedSignId: string,
	correctedSignId: string,
	landmarkData: unknown,
): void => {
	const sqlite = getDb();
	
	const logTransaction = sqlite.transaction(() => {
		const training: SignTrainingData = {
			id: generateId(),
			signId: correctedSignId,
			landmarkData,
			source: "HIP_3",
			syncStatus: "pending",
			approved: false,
		};
		addSignTrainingData(_db, training);

		const log: InteractionLog = {
			id: generateId(),
			signId: predictedSignId,
			wasSuccessful: false,
			confidenceScore: 0,
			timestamp: Date.now(),
			caregiverOverrideId: correctedSignId,
			processedBy: "local",
		};
		addInteractionLog(_db, log);
	});
	
	logTransaction();
};

export async function setupDatabase(filePath: string): Promise<Database> {
	// Initialize SQLite - use a temporary SQLite path based on the file path
	const sqlitePath = filePath.replace(/\.json$/, '.sqlite');
	// Always initialize to ensure we're using the correct database for this path
	await initializeDatabase(sqlitePath, filePath);
	
	const sqlite = getDb();

	// Check if symbols exist
	const symbolCount = sqlite.prepare("SELECT COUNT(*) as count FROM symbols").get() as { count: number };
	
	if (symbolCount.count === 0) {
		const defaultLabels = [
			{
				id: "alle",
				name: "Alle",
				emoji: "👥",
				color: "#94a3b8",
				category: "person",
			},
			{
				id: "blau",
				name: "Blau",
				emoji: "🔵",
				color: "#3b82f6",
				category: "color",
			},
			{
				id: "essen",
				name: "Essen",
				emoji: "🍽️",
				color: "#f59e0b",
				category: "food",
			},
			{
				id: "fertig",
				name: "Fertig",
				emoji: "✅",
				color: "#10b981",
				category: "action",
			},
			{
				id: "gelb",
				name: "Gelb",
				emoji: "🟡",
				color: "#fbbf24",
				category: "color",
			},
			{
				id: "gruen",
				name: "Grün",
				emoji: "🟢",
				color: "#22c55e",
				category: "color",
			},
			{
				id: "nochmal",
				name: "Nochmal",
				emoji: "🔁",
				color: "#6366f1",
				category: "action",
			},
			{
				id: "rot",
				name: "Rot",
				emoji: "🔴",
				color: "#ef4444",
				category: "color",
			},
			{
				id: "satt",
				name: "Satt",
				emoji: "😋",
				color: "#8b5cf6",
				category: "food",
			},
			{
				id: "schwester",
				name: "Schwester",
				emoji: "👧",
				color: "#ec4899",
				category: "person",
			},
			{
				id: "spielen",
				name: "Spielen",
				emoji: "🧸",
				color: "#f43f5e",
				category: "action",
			},
			{
				id: "trinken",
				name: "Trinken",
				emoji: "🥤",
				color: "#0ea5e9",
				category: "food",
			},
		];

		const insertSymbol = sqlite.prepare(`
			INSERT INTO symbols (id, name, emoji, color, category, imageUrl, audioUri, dgsVideoUri, healthScore, profileId)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);
		
		const seedTransaction = sqlite.transaction(() => {
			for (const label of defaultLabels) {
				insertSymbol.run(
					label.id,
					label.name,
					label.emoji,
					label.color,
					label.category,
					null,
					`${label.id}.mp3`,
					`dgs/${label.id}.mp4`,
					1,
					null,
				);
			}
		});
		
		seedTransaction();
	}

	const vocabSetCount = sqlite.prepare("SELECT COUNT(*) as count FROM vocabularySets").get() as { count: number };
	if (vocabSetCount.count === 0) {
		const sets: VocabularySet[] = [
			{ id: "basic", name: "Basic" },
			{ id: "animals", name: "Animals" },
		];
		
		const insertVocabSet = sqlite.prepare(`
			INSERT INTO vocabularySets (id, name)
			VALUES (?, ?)
		`);
		
		const seedTransaction = sqlite.transaction(() => {
			for (const set of sets) {
				insertVocabSet.run(set.id, set.name);
			}
		});
		
		seedTransaction();
	}

	const vocabSetSymbolCount = sqlite.prepare("SELECT COUNT(*) as count FROM vocabularySetSymbols").get() as { count: number };
	const symbolCountForVocab = sqlite.prepare("SELECT COUNT(*) as count FROM symbols").get() as { count: number };
	
	if (vocabSetSymbolCount.count === 0 && symbolCountForVocab.count > 0) {
		const symbols = sqlite.prepare("SELECT id FROM symbols").all() as { id: string }[];
		
		const insertVocabSetSymbol = sqlite.prepare(`
			INSERT INTO vocabularySetSymbols (id, vocabularySetId, symbolId)
			VALUES (?, ?, ?)
		`);
		
		const seedTransaction = sqlite.transaction(() => {
			for (const sym of symbols) {
				insertVocabSetSymbol.run(generateId(), "basic", sym.id);
			}
		});
		
		seedTransaction();
	}

	const usageStatCount = sqlite.prepare("SELECT COUNT(*) as count FROM usageStats").get() as { count: number };
	const profileCount = sqlite.prepare("SELECT COUNT(*) as count FROM profiles").get() as { count: number };
	
	if (usageStatCount.count === 0 && symbolCountForVocab.count > 0 && profileCount.count > 0) {
		// Only seed usage stats if profiles exist
		const profiles = sqlite.prepare("SELECT id FROM profiles LIMIT 1").all() as { id: string }[];
		if (profiles.length > 0) {
			const defaultProfileId = profiles[0].id;
			const symbols = sqlite.prepare("SELECT id FROM symbols").all() as { id: string }[];
			
			const insertUsageStat = sqlite.prepare(`
				INSERT INTO usageStats (id, symbolId, profileId, count)
				VALUES (?, ?, ?, ?)
			`);
			
			const seedTransaction = sqlite.transaction(() => {
				for (const sym of symbols) {
					insertUsageStat.run(generateId(), sym.id, defaultProfileId, 0);
				}
			});
			
			seedTransaction();
		}
	}

	return loadDatabase(sqlitePath);
}
