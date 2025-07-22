import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { database } from '../db';
import { GestureTrainingData, Profile as DBProfile } from '../db/models';

export interface Profile {
  id: string;
  name: string;
  consentDataUpload: boolean;
  consentHelpMeGetSmarter: boolean;
  vocabularySetId: string;
  largeText?: boolean;
  highContrast?: boolean;
}

const ACTIVE_PROFILE_KEY = 'activeProfileId';
const TRAINING_KEY = 'gestureTrainingData';
const LOG_KEY = 'interactionLogs';

export interface TrainingSample {
  id: string;
  gestureDefinitionId: string;
  landmarkData: unknown;
  source: 'HIP_2' | 'HIP_3';
  syncStatus: 'pending' | 'synced';
}

export async function loadProfiles(): Promise<Profile[]> {
  const records = await database.get<DBProfile>('profiles').query().fetch();
  return records.map(mapDbProfile);
}

function mapDbProfile(p: DBProfile): Profile {
  return {
    id: p.id,
    name: p.name,
    consentDataUpload: p.consentHelpMeLearnOverTime,
    consentHelpMeGetSmarter: p.consentHelpMeGetSmarter,
    vocabularySetId: (p as any).activeVocabularySet.id,
    largeText: p.largeText,
    highContrast: p.highContrast,
  };
}

export async function createProfile(profile: Omit<Profile, 'id'>): Promise<Profile> {
  let record!: DBProfile;
  await database.write(async () => {
    const collection = database.get<DBProfile>('profiles');
    record = await collection.create(p => {
      p.name = profile.name;
      p.consentHelpMeGetSmarter = profile.consentHelpMeGetSmarter;
      p.consentHelpMeLearnOverTime = profile.consentDataUpload;
      p.largeText = !!profile.largeText;
      p.highContrast = !!profile.highContrast;
      (p as any).activeVocabularySet.id = profile.vocabularySetId;
      p.createdAt = new Date();
      p.updatedAt = new Date();
    });
  });

  const full: Profile = { ...profile, id: record.id };
  await setActiveProfileId(full.id);
  return full;
}

export async function setActiveProfileId(id: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, id);
}

export async function loadActiveProfileId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_PROFILE_KEY);
}

export async function loadProfile(id?: string): Promise<Profile | null> {
  const pid = id || (await loadActiveProfileId());
  if (!pid) return null;
  try {
    const record = await database.get<DBProfile>('profiles').find(pid);
    return mapDbProfile(record);
  } catch {
    return null;
  }
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

  const collection = database.get<GestureTrainingData>('gesture_training_data');
  await database.write(async () => {
    await collection.create((record) => {
      record.gestureDefinition.id = gestureDefinitionId;
      record.landmarkData = JSON.stringify(landmarkData);
      record.source = 'HIP_2';
      record.qualityScore = 1;
      record.frameMetadata = '';
      record.createdAt = new Date();
    });
  });
}

const API_KEY = 'openaiApiKey';
export async function saveOpenAIApiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(API_KEY, key);
}

export async function loadOpenAIApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(API_KEY);
}

const BACKEND_TOKEN_KEY = 'backendApiToken';
export async function saveBackendApiToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(BACKEND_TOKEN_KEY, token);
}

export async function loadBackendApiToken(): Promise<string | null> {
  return SecureStore.getItemAsync(BACKEND_TOKEN_KEY);
}

const CUSTOM_MODEL_KEY = 'customModelUri';

export async function saveCustomModelUri(uri: string): Promise<void> {
  await AsyncStorage.setItem(CUSTOM_MODEL_KEY, uri);
}

export async function loadCustomModelUri(): Promise<string | null> {
  return AsyncStorage.getItem(CUSTOM_MODEL_KEY);
}
