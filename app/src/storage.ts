import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { database } from '../db';
import { Profile as DBProfile } from '../db/models';
import { secureConfigManager } from './services/secureConfig';
import { enqueueTrainingBundle } from './services/trainingBundleQueue';

export interface Profile {
  id: string;
  name: string;
  consentDataUpload: boolean;
  consentHelpMeGetSmarter: boolean;
  vocabularySetId: string;
  largeText?: boolean;
  highContrast?: boolean;
  successSound?: string; // Customizable success sound preference
  age?: number;
}

const ACTIVE_PROFILE_KEY = 'activeProfileId';

export interface TrainingFrame {
  landmarks: number[][][];
  // Values provided by MediaPipe such as "Left" / "Right"; optional when detector omits them
  handedness?: ReadonlyArray<string>;
}

export interface TrainingSample {
  id: string;
  profileId: string;
  label: string;
  frames: TrainingFrame[];
  clipUri: string;
  source: 'HIP_2' | 'HIP_3' | 'HIP_4';
  capturedAt: string;
  createdAt: string;
  syncStatus: 'pending' | 'queued' | 'synced';
  bundleKey?: string | null;
}

export interface TrainingSampleInput {
  profileId: string;
  label: string;
  frames: TrainingFrame[];
  clipUri: string;
  source?: 'HIP_2' | 'HIP_3' | 'HIP_4';
  capturedAt?: string;
}

export function createTrainingSample(input: TrainingSampleInput): TrainingSample {
  const now = new Date();
  return {
    id: genId(),
    profileId: input.profileId,
    label: input.label,
    frames: input.frames,
    clipUri: input.clipUri,
    source: input.source ?? 'HIP_2',
    capturedAt: input.capturedAt ?? now.toISOString(),
    createdAt: now.toISOString(),
    syncStatus: 'pending',
  };
}

function normalizeTrainingSample(raw: any, fallbackProfileId: string): TrainingSample | null {
  if (!raw || typeof raw !== 'object') return null;

  const label =
    typeof raw.label === 'string'
      ? raw.label
      : typeof raw.gestureDefinitionId === 'string'
      ? raw.gestureDefinitionId
      : null;
  if (!label) return null;

  const frames: TrainingFrame[] = Array.isArray(raw.frames)
    ? raw.frames
    : Array.isArray(raw.landmarkData)
    ? raw.landmarkData
    : [];

  const clipUri = typeof raw.clipUri === 'string' ? raw.clipUri : '';
  const source: TrainingSample['source'] = raw.source === 'HIP_3' || raw.source === 'HIP_4' ? raw.source : 'HIP_2';
  const capturedAt = typeof raw.capturedAt === 'string' ? raw.capturedAt : new Date().toISOString();
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString();
  const syncStatus: TrainingSample['syncStatus'] =
    raw.syncStatus === 'queued' || raw.syncStatus === 'synced' ? raw.syncStatus : 'pending';
  const profileId = typeof raw.profileId === 'string' ? raw.profileId : fallbackProfileId;
  const bundleKey = typeof raw.bundleKey === 'string' ? raw.bundleKey : undefined;

  return {
    id: typeof raw.id === 'string' ? raw.id : genId(),
    profileId,
    label,
    frames,
    clipUri,
    source,
    capturedAt,
    createdAt,
    syncStatus,
    bundleKey,
  };
}

async function loadSamplesForProfile(profileId: string): Promise<TrainingSample[]> {
  const trainingKey = `gestureTrainingData_${profileId}`;
  const raw = await AsyncStorage.getItem(trainingKey);
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn('Failed to parse training samples', error);
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const normalized: TrainingSample[] = [];
  let mutated = false;

  for (const entry of parsed) {
    const sample = normalizeTrainingSample(entry, profileId);
    if (!sample) continue;
    if (
      !entry ||
      typeof entry !== 'object' ||
      entry.label !== sample.label ||
      entry.clipUri !== sample.clipUri ||
      entry.profileId !== sample.profileId
    ) {
      mutated = true;
    }
    normalized.push(sample);
  }

  if (mutated) {
    await AsyncStorage.setItem(trainingKey, JSON.stringify(normalized));
  }

  return normalized;
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
    successSound: (p as any).successSound || 'success', // Default to 'success'
    age: typeof (p as any).age === 'number' ? (p as any).age : undefined,
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

const activeProfileListeners = new Set<(id: string | null) => void>();

export function onActiveProfileChange(listener: (id: string | null) => void): () => void {
  activeProfileListeners.add(listener);
  return () => {
    activeProfileListeners.delete(listener);
  };
}

export async function setActiveProfileId(id: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, id);
  activeProfileListeners.forEach((cb) => {
    try {
      cb(id);
    } catch (e) {
      console.warn('onActiveProfileChange listener failed:', e);
    }
  });
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

export async function logCorrection(correctId: string, profileId?: string): Promise<void> {
  const activeProfileId = profileId || (await loadActiveProfileId()) || 'default';
  const trainingKey = `gestureTrainingData_${activeProfileId}`;
  const logKey = `interactionLogs_${activeProfileId}`;

  const trainingRaw = await AsyncStorage.getItem(trainingKey);
  const training = trainingRaw ? JSON.parse(trainingRaw) : [];
  const sample = createTrainingSample({
    profileId: activeProfileId,
    label: correctId,
    frames: [],
    clipUri: '',
    source: 'HIP_3',
  });
  training.push(sample);
  await AsyncStorage.setItem(trainingKey, JSON.stringify(training));

  const logsRaw = await AsyncStorage.getItem(logKey);
  const logs = logsRaw ? JSON.parse(logsRaw) : [];
  logs.push({
    id: genId(),
    gestureDefinitionId: correctId,
    wasSuccessful: true,
    confidenceScore: 0,
    timestamp: Date.now(),
    processedBy: 'local',
  });
  await AsyncStorage.setItem(logKey, JSON.stringify(logs));
}

export async function saveTrainingSample(sample: TrainingSample): Promise<TrainingSample> {
  const trainingKey = `gestureTrainingData_${sample.profileId}`;
  const existing = await loadSamplesForProfile(sample.profileId);
  const stored: TrainingSample = { ...sample };

  if (stored.clipUri) {
    try {
      const bundleKey = await enqueueTrainingBundle(stored);
      stored.syncStatus = 'queued';
      stored.bundleKey = bundleKey;
    } catch (error) {
      console.warn('Failed to enqueue training bundle', error);
      stored.syncStatus = 'pending';
    }
  } else {
    stored.syncStatus = 'pending';
  }

  existing.push(stored);
  await AsyncStorage.setItem(trainingKey, JSON.stringify(existing));
  return stored;
}

export async function loadTrainingSampleCount(
  label: string,
  profileId?: string,
): Promise<number> {
  const activeProfileId = profileId || (await loadActiveProfileId()) || 'default';
  const samples = await loadSamplesForProfile(activeProfileId);
  return samples.filter((s) => s.label === label).length;
}

export async function loadTrainingSamples(profileId?: string): Promise<TrainingSample[]> {
  const activeProfileId = profileId || (await loadActiveProfileId()) || 'default';
  return loadSamplesForProfile(activeProfileId);
}

export async function updateTrainingSample(
  sampleId: string,
  profileId: string,
  updates: Partial<TrainingSample>,
): Promise<TrainingSample | null> {
  const samples = await loadSamplesForProfile(profileId);
  const index = samples.findIndex((sample) => sample.id === sampleId);
  if (index === -1) return null;
  const updated = { ...samples[index], ...updates } as TrainingSample;
  samples[index] = updated;
  const trainingKey = `gestureTrainingData_${profileId}`;
  await AsyncStorage.setItem(trainingKey, JSON.stringify(samples));
  return updated;
}

export async function loadInteractionLogs(profileId?: string): Promise<any[]> {
  const activeProfileId = profileId || (await loadActiveProfileId()) || 'default';
  const logKey = `interactionLogs_${activeProfileId}`;

  const raw = await AsyncStorage.getItem(logKey);
  return raw ? JSON.parse(raw) : [];
}

export async function clearProfileData(profileId: string): Promise<void> {
  const trainingKey = `gestureTrainingData_${profileId}`;
  const logKey = `interactionLogs_${profileId}`;

  await AsyncStorage.multiRemove([trainingKey, logKey]);
}

export async function saveOpenAIApiKey(key: string): Promise<void> {
  await secureConfigManager.setAPIKey(key);
}

export async function loadOpenAIApiKey(): Promise<string | null> {
  return secureConfigManager.getAPIKey();
}

const BACKEND_TOKEN_KEY = 'backendApiToken';
const BACKEND_TOKEN_FALLBACK_KEY = `${BACKEND_TOKEN_KEY}:fallback`;

export async function saveBackendApiToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(BACKEND_TOKEN_KEY, token);
  } catch (error) {
    await AsyncStorage.setItem(BACKEND_TOKEN_FALLBACK_KEY, token);
    return;
  }

  try {
    await AsyncStorage.removeItem(BACKEND_TOKEN_FALLBACK_KEY);
  } catch (removeError) {
    // Primary storage succeeded; stale fallback removal failures are non-fatal.
  }
}

export async function loadBackendApiToken(): Promise<string | null> {
  try {
    const token = await SecureStore.getItemAsync(BACKEND_TOKEN_KEY);
    if (token) {
      return token;
    }
  } catch (error) {
    // SecureStore unavailable; fall through to fallback storage.
  }

  return AsyncStorage.getItem(BACKEND_TOKEN_FALLBACK_KEY);
}

const CUSTOM_MODEL_KEY = 'customModelUri';
const CUSTOM_MODEL_HASH_KEY = 'customModelHash';

export async function saveCustomModelUri(uri: string): Promise<void> {
  await AsyncStorage.setItem(CUSTOM_MODEL_KEY, uri);
}

export async function loadCustomModelUri(): Promise<string | null> {
  return AsyncStorage.getItem(CUSTOM_MODEL_KEY);
}

export async function saveCustomModelHash(hash: string): Promise<void> {
  await AsyncStorage.setItem(CUSTOM_MODEL_HASH_KEY, hash);
}

export async function loadCustomModelHash(): Promise<string | null> {
  return AsyncStorage.getItem(CUSTOM_MODEL_HASH_KEY);
}

const CUSTOM_GESTURES_KEY = 'customGestures';

export interface CustomGesture {
  id: string;
  label: string;
  emoji?: string;
}

export async function saveCustomGesture(gesture: CustomGesture): Promise<void> {
  const raw = await AsyncStorage.getItem(CUSTOM_GESTURES_KEY);
  const gestures: CustomGesture[] = raw ? JSON.parse(raw) : [];
  if (!gestures.find((g) => g.id === gesture.id)) {
    gestures.push(gesture);
    await AsyncStorage.setItem(CUSTOM_GESTURES_KEY, JSON.stringify(gestures));
  }
}

export async function loadCustomGestures(): Promise<CustomGesture[]> {
  const raw = await AsyncStorage.getItem(CUSTOM_GESTURES_KEY);
  return raw ? JSON.parse(raw) : [];
}
