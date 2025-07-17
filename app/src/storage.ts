import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Profile {
  id: string;
  consentDataUpload: boolean;
  consentHelpMeGetSmarter: boolean;
  vocabularySetId: string;
  largeText?: boolean;
  highContrast?: boolean;
}

const PROFILE_KEY = 'profile';
const TRAINING_KEY = 'gestureTrainingData';
const LOG_KEY = 'interactionLogs';

export interface TrainingSample {
  id: string;
  gestureDefinitionId: string;
  landmarkData: unknown;
  source: 'HIP_2' | 'HIP_3';
  syncStatus: 'pending' | 'synced';
}

export async function saveProfile(profile: Profile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export async function loadProfile(): Promise<Profile | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Partial<Profile>;
  return {
    id: parsed.id || 'default',
    consentDataUpload: !!parsed.consentDataUpload,
    consentHelpMeGetSmarter: !!parsed.consentHelpMeGetSmarter,
    vocabularySetId: parsed.vocabularySetId || 'basic',
    largeText: !!parsed.largeText,
    highContrast: !!parsed.highContrast,
  };
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export async function logCorrection(correctId: string): Promise<void> {
  const trainingRaw = await AsyncStorage.getItem(TRAINING_KEY);
  const training = trainingRaw ? JSON.parse(trainingRaw) : [];
  training.push({
    id: genId(),
    gestureDefinitionId: correctId,
    landmarkData: null,
    source: 'HIP_3',
    syncStatus: 'pending',
  });
  await AsyncStorage.setItem(TRAINING_KEY, JSON.stringify(training));

  const logsRaw = await AsyncStorage.getItem(LOG_KEY);
  const logs = logsRaw ? JSON.parse(logsRaw) : [];
  logs.push({
    id: genId(),
    gestureDefinitionId: correctId,
    wasSuccessful: true,
    confidenceScore: 0,
    timestamp: Date.now(),
    processedBy: 'local',
  });
  await AsyncStorage.setItem(LOG_KEY, JSON.stringify(logs));
}

export async function saveTrainingSample(
  gestureDefinitionId: string,
  landmarkData: unknown,
): Promise<void> {
  const raw = await AsyncStorage.getItem(TRAINING_KEY);
  const data: TrainingSample[] = raw ? JSON.parse(raw) : [];
  data.push({
    id: genId(),
    gestureDefinitionId,
    landmarkData,
    source: 'HIP_2',
    syncStatus: 'pending',
  });
  await AsyncStorage.setItem(TRAINING_KEY, JSON.stringify(data));
}

const API_KEY = 'openaiApiKey';
export async function saveOpenAIApiKey(key: string): Promise<void> {
  await AsyncStorage.setItem(API_KEY, key);
}

export async function loadOpenAIApiKey(): Promise<string | null> {
  return AsyncStorage.getItem(API_KEY);
}

const CUSTOM_MODEL_KEY = 'customModelUri';

export async function saveCustomModelUri(uri: string): Promise<void> {
  await AsyncStorage.setItem(CUSTOM_MODEL_KEY, uri);
}

export async function loadCustomModelUri(): Promise<string | null> {
  return AsyncStorage.getItem(CUSTOM_MODEL_KEY);
}
