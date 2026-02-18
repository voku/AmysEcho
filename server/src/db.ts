import { randomBytes } from "crypto";
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
import {
	closeDatabase,
	deleteProfileDataFromSqlite,
	getAllCorrections,
	getAllInteractionLogs,
	getAllLearningAnalytics,
	getAllNegativeSamples,
	getAllProfiles,
	getAllSignDefinitions,
	getAllSignTrainingData,
	getAllSymbols,
	getAllUsageStats,
	getAllUsers,
	getAllVocabularySets,
	getAllVocabularySetSymbols,
	initializeDatabase,
	insertCorrection as sqliteInsertCorrection,
	insertInteractionLog,
	insertLearningAnalytics,
	insertNegativeSample,
	insertProfile,
	insertSignDefinition,
	insertSignTrainingData,
	insertSymbol,
	insertUser,
	insertUsageStat,
	insertVocabularySet,
	insertVocabularySetSymbol,
	updateInteractionLogInDb,
	updateLearningAnalyticsInDb,
	updateProfileInDb,
	updateSignDefinitionInDb,
	updateSignTrainingDataInDb,
	updateSymbolInDb,
	updateUsageStatInDb,
	updateUserInDb,
	updateVocabularySetInDb,
	updateVocabularySetSymbolInDb,
	deleteInteractionLogById,
	deleteLearningAnalyticsById,
	deleteProfileById,
	deleteSignDefinitionById,
	deleteSignTrainingDataById,
	deleteSymbolById,
	deleteUsageStatById,
	deleteUserById,
	deleteUserLabelSettingsByUserId,
	deleteVocabularySetById,
	deleteVocabularySetSymbolById,
} from "./sqliteDb.js";
import { DB_SQLITE_PATH } from "./constants/dbPaths.js";

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

// Track if SQLite is initialized
let sqliteInitialized = false;

// Current SQLite path for switching databases (tests)
let currentSqlitePath: string = DB_SQLITE_PATH;

/**
 * Helper to execute SQLite insert, ignoring UNIQUE constraint violations
 * for idempotent operations. Uses error code for robust detection.
 */
const insertIgnoringDuplicates = (insertFn: () => void): void => {
	if (sqliteInitialized) {
		try {
			insertFn();
		} catch (error) {
			// Use error code for robust UNIQUE constraint detection
			// better-sqlite3 sets code property on SqliteError
			const sqliteError = error as { code?: string };
			if (sqliteError.code !== "SQLITE_CONSTRAINT_UNIQUE") {
				throw error;
			}
		}
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

/**
 * Add a symbol to both the in-memory database and SQLite
 */
export const addSymbol = (db: Database, symbol: SymbolRecord): void => {
	db.symbols.push(symbol);
	insertIgnoringDuplicates(() => insertSymbol(symbol));
};

export const addSignDefinition = (db: Database, def: SignDefinition): void => {
	db.signDefinitions.push(def);
	insertIgnoringDuplicates(() => insertSignDefinition(def));
};

export const addSignTrainingData = (
	db: Database,
	data: SignTrainingData,
): void => {
	db.signTrainingData.push(data);
	insertIgnoringDuplicates(() => insertSignTrainingData(data));
};

export const addInteractionLog = (db: Database, log: InteractionLog): void => {
	db.interactionLogs.push(log);
	insertIgnoringDuplicates(() => insertInteractionLog(log));
};

export const addProfile = (db: Database, profile: Profile): void => {
	db.profiles.push(profile);
	insertIgnoringDuplicates(() => insertProfile(profile));
};

export const addVocabularySet = (db: Database, set: VocabularySet): void => {
	db.vocabularySets.push(set);
	insertIgnoringDuplicates(() => insertVocabularySet(set));
};

export const addVocabularySetSymbol = (
	db: Database,
	link: VocabularySetSymbol,
): void => {
	db.vocabularySetSymbols.push(link);
	insertIgnoringDuplicates(() => insertVocabularySetSymbol(link));
};

export const addUsageStat = (db: Database, stat: UsageStat): void => {
	db.usageStats.push(stat);
	insertIgnoringDuplicates(() => insertUsageStat(stat));
};

export const addLearningAnalytics = (
	db: Database,
	la: LearningAnalytics,
): void => {
	db.learningAnalytics.push(la);
	insertIgnoringDuplicates(() => insertLearningAnalytics(la));
};

export const addNegativeSample = (
	db: Database,
	sample: NegativeSample,
): void => {
	db.negativeSamples.push(sample);
	insertIgnoringDuplicates(() => insertNegativeSample(sample));
};

export const addCorrection = (db: Database, corr: Correction): void => {
	db.corrections.push(corr);
	insertIgnoringDuplicates(() => sqliteInsertCorrection(corr));
};

export const addUser = (db: Database, user: StoredUser): void => {
	// Security: Enforce username and email uniqueness at database layer
	const existingUsername = findUserByUsername(db, user.username);
	if (existingUsername) {
		throw new Error("Username already exists");
	}

	const existingEmail = findUserByEmail(db, user.email);
	if (existingEmail) {
		throw new Error("Email already exists");
	}

	// Normalize username and email before storing
	const normalizedUser = {
		...user,
		username: user.username.trim().toLowerCase(),
		email: user.email.trim().toLowerCase(),
	};

	db.users.push(normalizedUser);
	if (sqliteInitialized) {
		insertUser(normalizedUser);
	}
};

/**
 * Update a user record in both in-memory database and SQLite
 * Call this after modifying user properties to persist changes
 */
export const updateUser = (db: Database, user: StoredUser): void => {
	const index = db.users.findIndex((u) => u.id === user.id);
	if (index !== -1) {
		db.users[index] = user;
	}
	if (sqliteInitialized) {
		updateUserInDb(user);
	}
};

export const findUserByUsername = (
	db: Database,
	username: string,
): StoredUser | undefined => {
	const normalized = username.trim().toLowerCase();
	// In-memory array is synced with SQLite, so just search there
	return db.users.find((u) => u.username === normalized);
};

export const findUserByEmail = (
	db: Database,
	email: string,
): StoredUser | undefined => {
	const normalized = email.trim().toLowerCase();
	// In-memory array is synced with SQLite, so just search there
	return db.users.find((u) => u.email === normalized);
};

export const findUserById = (
	db: Database,
	id: string,
): StoredUser | undefined => {
	// In-memory array is synced with SQLite, so just search there
	return db.users.find((user) => user.id === id);
};

export const removeUser = (db: Database, id: string): void => {
	removeById(db.users, id);
	if (sqliteInitialized) {
		deleteUserById(id);
		deleteUserLabelSettingsByUserId(id);
	}
};

const updateById = <T extends { id: string }>(items: T[], record: T): void => {
	const index = items.findIndex((i) => i.id === record.id);
	if (index !== -1) {
		items[index] = record;
	}
};

const removeById = <T extends { id: string }>(items: T[], id: string): void => {
	const index = items.findIndex((i) => i.id === id);
	if (index !== -1) {
		items.splice(index, 1);
	}
};

export const updateSymbol = (db: Database, symbol: SymbolRecord): void => {
	updateById(db.symbols, symbol);
	if (sqliteInitialized) {
		updateSymbolInDb(symbol);
	}
};

export const removeSymbol = (db: Database, id: string): void => {
	removeById(db.symbols, id);
	if (sqliteInitialized) {
		deleteSymbolById(id);
	}
};

export const updateSignDefinition = (
	db: Database,
	def: SignDefinition,
): void => {
	updateById(db.signDefinitions, def);
	if (sqliteInitialized) {
		updateSignDefinitionInDb(def);
	}
};

export const removeSignDefinition = (db: Database, id: string): void => {
	removeById(db.signDefinitions, id);
	if (sqliteInitialized) {
		deleteSignDefinitionById(id);
	}
};

export const updateSignTrainingData = (
	db: Database,
	data: SignTrainingData,
): void => {
	updateById(db.signTrainingData, data);
	if (sqliteInitialized) {
		updateSignTrainingDataInDb(data);
	}
};

export const removeSignTrainingData = (db: Database, id: string): void => {
	removeById(db.signTrainingData, id);
	if (sqliteInitialized) {
		deleteSignTrainingDataById(id);
	}
};

export const updateInteractionLog = (
	db: Database,
	log: InteractionLog,
): void => {
	updateById(db.interactionLogs, log);
	if (sqliteInitialized) {
		updateInteractionLogInDb(log);
	}
};

export const removeInteractionLog = (db: Database, id: string): void => {
	removeById(db.interactionLogs, id);
	if (sqliteInitialized) {
		deleteInteractionLogById(id);
	}
};

export const updateProfile = (db: Database, profile: Profile): void => {
	updateById(db.profiles, profile);
	if (sqliteInitialized) {
		updateProfileInDb(profile);
	}
};

export const updateVocabularySet = (db: Database, set: VocabularySet): void => {
	updateById(db.vocabularySets, set);
	if (sqliteInitialized) {
		updateVocabularySetInDb(set);
	}
};

export const updateVocabularySetSymbol = (
	db: Database,
	link: VocabularySetSymbol,
): void => {
	updateById(db.vocabularySetSymbols, link);
	if (sqliteInitialized) {
		updateVocabularySetSymbolInDb(link);
	}
};

export const updateUsageStat = (db: Database, stat: UsageStat): void => {
	updateById(db.usageStats, stat);
	if (sqliteInitialized) {
		updateUsageStatInDb(stat);
	}
};

export const removeProfile = (db: Database, id: string): void => {
	removeById(db.profiles, id);
	if (sqliteInitialized) {
		deleteProfileById(id);
	}
};

export const removeVocabularySet = (db: Database, id: string): void => {
	removeById(db.vocabularySets, id);
	if (sqliteInitialized) {
		deleteVocabularySetById(id);
	}
};

export const removeVocabularySetSymbol = (db: Database, id: string): void => {
	removeById(db.vocabularySetSymbols, id);
	if (sqliteInitialized) {
		deleteVocabularySetSymbolById(id);
	}
};

export const removeUsageStat = (db: Database, id: string): void => {
	removeById(db.usageStats, id);
	if (sqliteInitialized) {
		deleteUsageStatById(id);
	}
};

export const updateLearningAnalytics = (
	db: Database,
	la: LearningAnalytics,
): void => {
	updateById(db.learningAnalytics, la);
	if (sqliteInitialized) {
		updateLearningAnalyticsInDb(la);
	}
};

export const removeLearningAnalytics = (db: Database, id: string): void => {
	removeById(db.learningAnalytics, id);
	if (sqliteInitialized) {
		deleteLearningAnalyticsById(id);
	}
};

export const getSymbolById = (
	db: Database,
	id: string,
): SymbolRecord | undefined => db.symbols.find((s) => s.id === id);

export const getSignDefinitionById = (
	db: Database,
	id: string,
): SignDefinition | undefined => db.signDefinitions.find((g) => g.id === id);

export const getSignTrainingDataById = (
	db: Database,
	id: string,
): SignTrainingData | undefined => db.signTrainingData.find((d) => d.id === id);

export const getInteractionLogById = (
	db: Database,
	id: string,
): InteractionLog | undefined => db.interactionLogs.find((l) => l.id === id);

export const getProfileById = (db: Database, id: string): Profile | undefined =>
	db.profiles.find((p) => p.id === id);

export const getVocabularySetById = (
	db: Database,
	id: string,
): VocabularySet | undefined => db.vocabularySets.find((v) => v.id === id);

export const getVocabularySetSymbolById = (
	db: Database,
	id: string,
): VocabularySetSymbol | undefined =>
	db.vocabularySetSymbols.find((l) => l.id === id);

export const getUsageStatById = (
	db: Database,
	id: string,
): UsageStat | undefined => db.usageStats.find((u) => u.id === id);

export const getLearningAnalyticsById = (
	db: Database,
	id: string,
): LearningAnalytics | undefined =>
	db.learningAnalytics.find((l) => l.id === id);

/**
 * Save database to disk.
 * With SQLite backend, this is a no-op as all operations are immediately persisted.
 * Kept for API compatibility with existing code.
 *
 * @param db - The in-memory database instance (ignored with SQLite)
 * @param filePath - The file path (ignored with SQLite, kept for compatibility)
 */
export const saveDatabase = async (
	_db: Database,
	_filePath: string,
): Promise<void> => {
	// No-op: SQLite persists all changes immediately
	// This function is kept for API compatibility with existing code
};

/**
 * Load database from SQLite storage
 * Initializes SQLite if not already done and loads all data into memory structure
 *
 * @param filePath - Path for backward compatibility (derives SQLite path from it)
 * @returns Promise<Database> - The in-memory database populated from SQLite
 */
export const loadDatabase = async (filePath: string): Promise<Database> => {
	// Derive SQLite path from the JSON path for test isolation
	const sqlitePath = filePath.replace(/\.json$/, ".sqlite");

	// If path changed, close existing connection
	if (currentSqlitePath !== sqlitePath) {
		closeDatabase();
		sqliteInitialized = false;
		currentSqlitePath = sqlitePath;
	}

	// Initialize SQLite (will migrate from JSON if exists)
	await initializeDatabase(sqlitePath, filePath);
	sqliteInitialized = true;

	// Load all data from SQLite into memory structure
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
};

// Utility to create a cryptographically secure unique id
const generateId = (): string => randomBytes(16).toString("hex");

export const seedProfileSymbols = (db: Database, profileId: string): void => {
	const globalSymbols = db.symbols.filter((s) => !s.profileId);
	for (const globalSymbol of globalSymbols) {
		const profileSymbolId = `${globalSymbol.id}-${profileId}`;
		// Check if this symbol already exists for the profile to prevent duplicates
		const alreadyExists = db.symbols.some((s) => s.id === profileSymbolId);
		if (!alreadyExists) {
			const profileSymbol: SymbolRecord = {
				...globalSymbol,
				id: profileSymbolId, // Unique ID for profile symbol
				profileId,
			};
			// Use addSymbol which handles both memory and SQLite
			addSymbol(db, profileSymbol);
		}
	}
};

export const persistProfile = async (
	db: Database,
	profile: Profile,
	_filePath: string,
): Promise<void> => {
	const existing = db.profiles.find((p) => p.id === profile.id);
	if (existing) {
		updateProfile(db, profile);
	} else {
		addProfile(db, profile);
	}
	// saveDatabase is now a no-op with SQLite
	await saveDatabase(db, _filePath);
};

export const getProfileData = (db: Database, profileId: string) => ({
	profile: db.profiles.find((p) => p.id === profileId) || null,
	usageStats: db.usageStats.filter((u) => u.profileId === profileId),
	corrections: db.corrections.filter((c) => c.profileId === profileId),
});

/**
 * Delete all profile data from both in-memory database and SQLite
 */
export const deleteProfileData = async (
	db: Database,
	profileId: string,
	_filePath: string,
): Promise<void> => {
	// Update in-memory arrays
	db.profiles = db.profiles.filter((p) => p.id !== profileId);
	db.usageStats = db.usageStats.filter((u) => u.profileId !== profileId);
	db.corrections = db.corrections.filter((c) => c.profileId !== profileId);

	// Delete from SQLite
	if (sqliteInitialized) {
		deleteProfileDataFromSqlite(profileId);
	}
};

export const logCorrection = (
	db: Database,
	predictedSignId: string,
	correctedSignId: string,
	landmarkData: unknown,
): void => {
	const training: SignTrainingData = {
		id: generateId(),
		signId: correctedSignId,
		landmarkData,
		source: "HIP_3",
		syncStatus: "pending",
		approved: false,
	};
	addSignTrainingData(db, training);

	const log: InteractionLog = {
		id: generateId(),
		signId: predictedSignId,
		wasSuccessful: false,
		confidenceScore: 0,
		timestamp: Date.now(),
		caregiverOverrideId: correctedSignId,
		processedBy: "local",
	};
	addInteractionLog(db, log);
};

export async function setupDatabase(filePath: string): Promise<Database> {
	const db = await loadDatabase(filePath);

	// Profiles are now created via user registration only
	// No automatic profile creation or migration

	if (db.symbols.length === 0) {
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

		for (const label of defaultLabels) {
			const symbol: SymbolRecord = {
				id: label.id,
				name: label.name,
				emoji: label.emoji,
				color: label.color,
				category: label.category,
				imageUrl: undefined,
				audioUri: `${label.id}.mp3`,
				dgsVideoUri: `dgs/${label.id}.mp4`,
				healthScore: 1,
			};
			addSymbol(db, symbol);
		}
	}

	if (db.vocabularySets.length === 0) {
		addVocabularySet(db, { id: "basic", name: "Basic" });
		addVocabularySet(db, { id: "animals", name: "Animals" });
	}

	if (db.vocabularySetSymbols.length === 0 && db.symbols.length > 0) {
		for (const sym of db.symbols) {
			addVocabularySetSymbol(db, {
				id: generateId(),
				vocabularySetId: "basic",
				symbolId: sym.id,
			});
		}
	}

	if (db.usageStats.length === 0 && db.symbols.length > 0 && db.profiles.length > 0) {
		// Only seed usage stats if profiles exist
		// In production, profiles are created via user registration
		const defaultProfileId = db.profiles[0].id;
		for (const sym of db.symbols) {
			addUsageStat(db, {
				id: generateId(),
				symbolId: sym.id,
				profileId: defaultProfileId,
				count: 0,
			});
		}
	}

	return db;
}

/**
 * Migration: Add userId to profiles that don't have one
 * Assigns each profile to a user based on matching IDs (userId === profileId pattern)
 * or creates a default "system" user for orphaned profiles
 */

