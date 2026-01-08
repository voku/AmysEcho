import {
  SymbolRecord,
  SignDefinition,
  SignTrainingData,
  InteractionLog,
  Profile,
  LearningAnalytics,
  VocabularySet,
  UsageStat,
  VocabularySetSymbol,
  Correction,
  NegativeSample,
  StoredUser,
} from './types.js';
import { promises as fs } from 'fs';
import path from 'path';
import { randomBytes, randomUUID } from 'crypto';

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
  corrections: Correction[]; // Added comment to force re-evaluation
  negativeSamples: NegativeSample[];
  users: StoredUser[];
}

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

export const addSymbol = (db: Database, symbol: SymbolRecord): void => {
  db.symbols.push(symbol);
};

export const addSignDefinition = (
  db: Database,
  def: SignDefinition,
): void => {
  db.signDefinitions.push(def);
};

export const addSignTrainingData = (
  db: Database,
  data: SignTrainingData,
): void => {
  db.signTrainingData.push(data);
};

export const addInteractionLog = (
  db: Database,
  log: InteractionLog,
): void => {
  db.interactionLogs.push(log);
};

export const addProfile = (db: Database, profile: Profile): void => {
  db.profiles.push(profile);
};

export const addVocabularySet = (db: Database, set: VocabularySet): void => {
  db.vocabularySets.push(set);
};

export const addVocabularySetSymbol = (
  db: Database,
  link: VocabularySetSymbol,
): void => {
  db.vocabularySetSymbols.push(link);
};

export const addUsageStat = (db: Database, stat: UsageStat): void => {
  db.usageStats.push(stat);
};

export const addLearningAnalytics = (
  db: Database,
  la: LearningAnalytics,
): void => {
  db.learningAnalytics.push(la);
};

export const addNegativeSample = (
  db: Database,
  sample: NegativeSample,
): void => {
  db.negativeSamples.push(sample);
};

export const addUser = (db: Database, user: StoredUser): void => {
  db.users.push(user);
};

export const findUserByUsername = (
  db: Database,
  username: string,
): StoredUser | undefined => {
  const normalized = username.trim().toLowerCase();
  return db.users.find((u) => u.username === normalized);
};

export const findUserByEmail = (
  db: Database,
  email: string,
): StoredUser | undefined => {
  const normalized = email.trim().toLowerCase();
  return db.users.find((u) => u.email === normalized);
};

export const findUserById = (db: Database, id: string): StoredUser | undefined =>
  db.users.find((user) => user.id === id);

const updateById = <T extends { id: string }>(
  items: T[],
  record: T,
): void => {
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
};

export const removeSymbol = (db: Database, id: string): void => {
  removeById(db.symbols, id);
};

export const updateSignDefinition = (
  db: Database,
  def: SignDefinition,
): void => {
  updateById(db.signDefinitions, def);
};

export const removeSignDefinition = (db: Database, id: string): void => {
  removeById(db.signDefinitions, id);
};

export const updateSignTrainingData = (
  db: Database,
  data: SignTrainingData,
): void => {
  updateById(db.signTrainingData, data);
};

export const removeSignTrainingData = (db: Database, id: string): void => {
  removeById(db.signTrainingData, id);
};

export const updateInteractionLog = (
  db: Database,
  log: InteractionLog,
): void => {
  updateById(db.interactionLogs, log);
};

export const removeInteractionLog = (db: Database, id: string): void => {
  removeById(db.interactionLogs, id);
};

export const updateProfile = (db: Database, profile: Profile): void => {
  updateById(db.profiles, profile);
};

export const updateVocabularySet = (db: Database, set: VocabularySet): void => {
  updateById(db.vocabularySets, set);
};

export const updateVocabularySetSymbol = (
  db: Database,
  link: VocabularySetSymbol,
): void => {
  updateById(db.vocabularySetSymbols, link);
};

export const updateUsageStat = (db: Database, stat: UsageStat): void => {
  updateById(db.usageStats, stat);
};

export const removeProfile = (db: Database, id: string): void => {
  removeById(db.profiles, id);
};

export const removeVocabularySet = (db: Database, id: string): void => {
  removeById(db.vocabularySets, id);
};

export const removeVocabularySetSymbol = (db: Database, id: string): void => {
  removeById(db.vocabularySetSymbols, id);
};

export const removeUsageStat = (db: Database, id: string): void => {
  removeById(db.usageStats, id);
};

export const updateLearningAnalytics = (
  db: Database,
  la: LearningAnalytics,
): void => {
  updateById(db.learningAnalytics, la);
};

export const removeLearningAnalytics = (db: Database, id: string): void => {
  removeById(db.learningAnalytics, id);
};

export const getSymbolById = (db: Database, id: string): SymbolRecord | undefined =>
  db.symbols.find((s) => s.id === id);

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
): VocabularySetSymbol | undefined => db.vocabularySetSymbols.find((l) => l.id === id);

export const getUsageStatById = (
  db: Database,
  id: string,
): UsageStat | undefined => db.usageStats.find((u) => u.id === id);

export const getLearningAnalyticsById = (
  db: Database,
  id: string,
): LearningAnalytics | undefined => db.learningAnalytics.find((l) => l.id === id);

export const saveDatabase = async (
  db: Database,
  filePath: string,
): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(db, null, 2), 'utf8');
};

export const loadDatabase = async (filePath: string): Promise<Database> => {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data) as Partial<Database>;
    const base = createDatabase();
    Object.assign(base, parsed);
    if (!Array.isArray(base.users)) {
      base.users = [];
    }
    base.users = base.users
      .filter((user): user is StoredUser & { username: string } => !!user && typeof user.username === 'string')
      .map((user) => ({
        ...user,
        username: user.username.trim().toLowerCase(),
        email: typeof user.email === 'string' ? user.email.trim().toLowerCase() : '',
        displayName: typeof user.displayName === 'string' ? user.displayName : undefined,
        emailVerifiedAt: typeof user.emailVerifiedAt === 'number' ? user.emailVerifiedAt : undefined,
        emailVerificationTokenHash:
          typeof user.emailVerificationTokenHash === 'string' ? user.emailVerificationTokenHash : undefined,
        emailVerificationExpiresAt:
          typeof user.emailVerificationExpiresAt === 'number' ? user.emailVerificationExpiresAt : undefined,
        emailVerificationSentAt:
          typeof user.emailVerificationSentAt === 'number' ? user.emailVerificationSentAt : undefined,
      }));
    return base;
  } catch (error) {
    console.error('Failed to load database, creating a new one.', error);
    return createDatabase();
  }
};

// Utility to create a cryptographically secure unique id
const generateId = (): string => randomBytes(16).toString('hex');

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
      db.symbols.push(profileSymbol);
    }
  }
};

export const persistProfile = async (
  db: Database,
  profile: Profile,
  filePath: string,
): Promise<void> => {
  const existing = db.profiles.find((p) => p.id === profile.id);
  if (existing) {
    updateById(db.profiles, profile);
  } else {
    addProfile(db, profile);
  }
  await saveDatabase(db, filePath);
};

export const getProfileData = (db: Database, profileId: string) => ({
  profile: db.profiles.find((p) => p.id === profileId) || null,
  usageStats: db.usageStats.filter((u) => u.profileId === profileId),
  corrections: db.corrections.filter((c) => c.profileId === profileId),
});

export const deleteProfileData = async (
  db: Database,
  profileId: string,
  filePath: string,
): Promise<void> => {
  db.profiles = db.profiles.filter((p) => p.id !== profileId);
  db.usageStats = db.usageStats.filter((u) => u.profileId !== profileId);
  db.corrections = db.corrections.filter((c) => c.profileId !== profileId);
  await saveDatabase(db, filePath);
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
    source: 'HIP_3',
    syncStatus: 'pending',
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
    processedBy: 'local',
  };
  addInteractionLog(db, log);
};

export async function setupDatabase(filePath: string): Promise<Database> {
  const db = await loadDatabase(filePath);
  let changed = false;

  if (db.profiles.length === 0) {
    const profile: Profile = {
      id: randomUUID(),
      displayName: 'Standardprofil',
      createdAt: new Date().toISOString(),
      consentDataUpload: false,
      consentHelpMeGetSmarter: false,
      vocabularySetId: 'basic',
    };
    db.profiles.push(profile);
    changed = true;
  }

  if (db.symbols.length === 0) {
    const defaultLabels = [
      { id: 'alle', name: 'Alle', emoji: '👥', color: '#94a3b8', category: 'person' },
      { id: 'blau', name: 'Blau', emoji: '🔵', color: '#3b82f6', category: 'color' },
      { id: 'essen', name: 'Essen', emoji: '🍽️', color: '#f59e0b', category: 'food' },
      { id: 'fertig', name: 'Fertig', emoji: '✅', color: '#10b981', category: 'action' },
      { id: 'gelb', name: 'Gelb', emoji: '🟡', color: '#fbbf24', category: 'color' },
      { id: 'gruen', name: 'Grün', emoji: '🟢', color: '#22c55e', category: 'color' },
      { id: 'nochmal', name: 'Nochmal', emoji: '🔁', color: '#6366f1', category: 'action' },
      { id: 'rot', name: 'Rot', emoji: '🔴', color: '#ef4444', category: 'color' },
      { id: 'satt', name: 'Satt', emoji: '😋', color: '#8b5cf6', category: 'food' },
      { id: 'schwester', name: 'Schwester', emoji: '👧', color: '#ec4899', category: 'person' },
      { id: 'spielen', name: 'Spielen', emoji: '🧸', color: '#f43f5e', category: 'action' },
      { id: 'trinken', name: 'Trinken', emoji: '🥤', color: '#0ea5e9', category: 'food' },
    ];

    const defaults: SymbolRecord[] = defaultLabels.map(label => ({
      id: label.id,
      name: label.name,
      emoji: label.emoji,
      color: label.color,
      category: label.category,
      imageUrl: undefined,
      audioUri: `${label.id}.mp3`,
      dgsVideoUri: `dgs/${label.id}.mp4`,
      healthScore: 1,
    }));
    db.symbols.push(...defaults);
    changed = true;
  }

  if (db.vocabularySets.length === 0) {
    const sets: VocabularySet[] = [
      { id: 'basic', name: 'Basic' },
      { id: 'animals', name: 'Animals' },
    ];
    db.vocabularySets.push(...sets);
    changed = true;
  }

  if (db.vocabularySetSymbols.length === 0 && db.symbols.length > 0) {
    for (const sym of db.symbols) {
      db.vocabularySetSymbols.push({
        id: generateId(),
        vocabularySetId: 'basic',
        symbolId: sym.id,
      });
    }
    changed = true;
  }

  if (db.usageStats.length === 0 && db.symbols.length > 0) {
    // Defensive check: setupDatabase should have created a profile above if none existed
    if (db.profiles.length === 0) {
      throw new Error('Cannot seed usage stats: no profiles exist');
    }
    const defaultProfileId = db.profiles[0].id;
    for (const sym of db.symbols) {
      db.usageStats.push({
        id: generateId(),
        symbolId: sym.id,
        profileId: defaultProfileId,
        count: 0,
      });
    }
    changed = true;
  }

  if (changed) {
    await saveDatabase(db, filePath);
  }

  return db;
}
