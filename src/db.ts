import {
  SymbolRecord,
  GestureDefinition,
  GestureTrainingData,
  InteractionLog,
  Profile,
  LearningAnalytics,
  VocabularySet,
  UsageStat,
  VocabularySetSymbol,
} from './types';
import { promises as fs } from 'fs';
import path from 'path';

export interface Database {
  symbols: SymbolRecord[];
  gestureDefinitions: GestureDefinition[];
  gestureTrainingData: GestureTrainingData[];
  interactionLogs: InteractionLog[];
  profiles: Profile[];
  vocabularySets: VocabularySet[];
  vocabularySetSymbols: VocabularySetSymbol[];
  usageStats: UsageStat[];
  learningAnalytics: LearningAnalytics[];
}

export const createDatabase = (): Database => ({
  symbols: [],
  gestureDefinitions: [],
  gestureTrainingData: [],
  interactionLogs: [],
  profiles: [],
  vocabularySets: [],
  vocabularySetSymbols: [],
  usageStats: [],
  learningAnalytics: [],
});

export const addSymbol = (db: Database, symbol: SymbolRecord): void => {
  db.symbols.push(symbol);
};

export const addGestureDefinition = (
  db: Database,
  def: GestureDefinition,
): void => {
  db.gestureDefinitions.push(def);
};

export const addGestureTrainingData = (
  db: Database,
  data: GestureTrainingData,
): void => {
  db.gestureTrainingData.push(data);
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

export const updateGestureDefinition = (
  db: Database,
  def: GestureDefinition,
): void => {
  updateById(db.gestureDefinitions, def);
};

export const removeGestureDefinition = (db: Database, id: string): void => {
  removeById(db.gestureDefinitions, id);
};

export const updateGestureTrainingData = (
  db: Database,
  data: GestureTrainingData,
): void => {
  updateById(db.gestureTrainingData, data);
};

export const removeGestureTrainingData = (db: Database, id: string): void => {
  removeById(db.gestureTrainingData, id);
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

export const getGestureDefinitionById = (
  db: Database,
  id: string,
): GestureDefinition | undefined => db.gestureDefinitions.find((g) => g.id === id);

export const getGestureTrainingDataById = (
  db: Database,
  id: string,
): GestureTrainingData | undefined => db.gestureTrainingData.find((d) => d.id === id);

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
    return JSON.parse(data) as Database;
  } catch {
    return createDatabase();
  }
};

// Utility to create a lightweight unique id without external deps
const generateId = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2);

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

export const logCorrection = (
  db: Database,
  predictedGestureId: string,
  correctedGestureId: string,
  landmarkData: unknown,
): void => {
  const training: GestureTrainingData = {
    id: generateId(),
    gestureDefinitionId: correctedGestureId,
    landmarkData,
    source: 'HIP_3',
    syncStatus: 'pending',
  };
  addGestureTrainingData(db, training);

  const log: InteractionLog = {
    id: generateId(),
    gestureDefinitionId: predictedGestureId,
    wasSuccessful: false,
    confidenceScore: 0,
    timestamp: Date.now(),
    caregiverOverrideId: correctedGestureId,
    processedBy: 'local',
  };
  addInteractionLog(db, log);
};

export async function setupDatabase(filePath: string): Promise<Database> {
  let db = await loadDatabase(filePath);
  let changed = false;

  if (db.profiles.length === 0) {
    const profile: Profile = {
      id: 'default',
      consentDataUpload: false,
      consentHelpMeGetSmarter: false,
      vocabularySetId: 'basic',
    };
    db.profiles.push(profile);
    changed = true;
  }

  if (db.symbols.length === 0) {
    const defaults: SymbolRecord[] = [
      {
        id: 'hello',
        name: 'Hello',
        emoji: '👋',
        color: '#ffcc00',
        audioUri: 'hello.mp3',
        dgsVideoUri: 'dgs/hello.mp4',
        healthScore: 1,
      },
      {
        id: 'drink',
        name: 'Drink',
        emoji: '🥤',
        color: '#0099ff',
        audioUri: 'drink.mp3',
        dgsVideoUri: 'dgs/drink.mp4',
        healthScore: 1,
      },
    ];
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
    for (const sym of db.symbols) {
      db.usageStats.push({
        id: generateId(),
        symbolId: sym.id,
        profileId: 'default',
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
