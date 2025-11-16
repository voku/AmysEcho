import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { database } from '../db';
import {
  loadProfiles,
  createProfile,
  setActiveProfileId,
  loadActiveProfileId,
  loadProfile,
  logCorrection,
  saveTrainingSample,
  loadTrainingSampleCount,
  saveOpenAIApiKey,
  loadOpenAIApiKey,
  saveBackendApiToken,
  loadBackendApiToken,
  saveCustomModelUri,
  loadCustomModelUri,
  saveCustomModelHash,
  loadCustomModelHash,
  saveCustomGesture,
  loadCustomGestures,
  TrainingFrame,
  createTrainingSample,
  rehydratePendingTrainingSamples,
} from '../src/storage';
import { enqueueTrainingBundle } from '../src/services/trainingBundleQueue';

const TEST_PROFILE_ID = 'profile-storage';

// Mock dependencies
jest.mock('@react-native-async-storage/async-storage');
jest.mock('expo-secure-store');
jest.mock('../db', () => ({
  database: {
    get: jest.fn(),
    write: jest.fn(),
  },
}));
jest.mock('../src/services/secureConfig', () => ({
  secureConfigManager: {
    setAPIKey: jest.fn(),
    getAPIKey: jest.fn(),
  },
}));
jest.mock('../src/services/trainingBundleQueue', () => ({
  enqueueTrainingBundle: jest.fn(async () => 'bundle-key'),
}));
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    gestureEvent: jest.fn(),
    apiCall: jest.fn(),
    performanceMetric: jest.fn(),
    setContext: jest.fn(),
    clearContext: jest.fn(),
    setLevel: jest.fn(),
  },
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;
const mockDatabase = database as jest.Mocked<typeof database>;
const mockEnqueue = enqueueTrainingBundle as jest.MockedFunction<typeof enqueueTrainingBundle>;

describe('Storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadProfiles', () => {
    it('loads and maps profiles from database', async () => {
      const mockRecords = [
        {
          id: '1',
          name: 'Test Profile',
          consentHelpMeLearnOverTime: true,
          consentHelpMeGetSmarter: false,
          activeVocabularySet: { id: 'vocab1' },
          largeText: true,
          highContrast: false,
        },
      ];

      const mockCollection = {
        query: jest.fn().mockReturnThis(),
        fetch: jest.fn().mockResolvedValue(mockRecords),
      };

      mockDatabase.get.mockReturnValue(mockCollection as any);

      const result = await loadProfiles();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: '1',
        name: 'Test Profile',
        consentDataUpload: true,
        consentHelpMeGetSmarter: false,
        vocabularySetId: 'vocab1',
        largeText: true,
        highContrast: false,
        successSound: 'success',
        age: undefined,
      });
    });
  });

  describe('createProfile', () => {
    it('creates a new profile and sets it as active', async () => {
      const mockCollection = {
        create: jest.fn().mockImplementation((callback) => {
          const record = {
            id: 'new-id',
            name: 'Test',
            consentHelpMeGetSmarter: true,
            consentHelpMeLearnOverTime: false,
            largeText: false,
            highContrast: true,
            activeVocabularySet: { id: 'vocab1' },
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          callback(record);
          return record;
        }),
      };

      mockDatabase.get.mockReturnValue(mockCollection as any);
      mockDatabase.write.mockImplementation((callback) => callback());
      mockAsyncStorage.setItem.mockResolvedValue();

      const profileData = {
        name: 'Test',
        consentDataUpload: false,
        consentHelpMeGetSmarter: true,
        vocabularySetId: 'vocab1',
        largeText: false,
        highContrast: true,
      };

      const result = await createProfile(profileData);

      expect(result.id).toBe('new-id');
      expect(result.name).toBe('Test');
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('activeProfileId', 'new-id');
    });
  });

  describe('loadProfile', () => {
    it('loads profile by id', async () => {
      const mockRecord = {
        id: '1',
        name: 'Test',
        consentHelpMeLearnOverTime: true,
        consentHelpMeGetSmarter: false,
        activeVocabularySet: { id: 'vocab1' },
        largeText: false,
        highContrast: true,
      };

      const mockCollection = {
        find: jest.fn().mockResolvedValue(mockRecord),
      };

      mockDatabase.get.mockReturnValue(mockCollection as any);

      const result = await loadProfile('1');

      expect(result).toEqual({
        id: '1',
        name: 'Test',
        consentDataUpload: true,
        consentHelpMeGetSmarter: false,
        vocabularySetId: 'vocab1',
        largeText: false,
        highContrast: true,
        successSound: 'success',
        age: undefined,
      });
    });

    it('returns null when profile not found', async () => {
      const mockCollection = {
        find: jest.fn().mockRejectedValue(new Error('Not found')),
      };

      mockDatabase.get.mockReturnValue(mockCollection as any);

      const result = await loadProfile('nonexistent');

      expect(result).toBeNull();
    });

    it('loads active profile when no id provided', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('active-id');

      const mockRecord = {
        id: 'active-id',
        name: 'Active',
        consentHelpMeLearnOverTime: false,
        consentHelpMeGetSmarter: true,
        activeVocabularySet: { id: 'vocab2' },
        largeText: true,
        highContrast: false,
      };

      const mockCollection = {
        find: jest.fn().mockResolvedValue(mockRecord),
      };

      mockDatabase.get.mockReturnValue(mockCollection as any);

      const result = await loadProfile();

      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('activeProfileId');
      expect(result?.id).toBe('active-id');
    });

    it('returns null when no active profile', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await loadProfile();

      expect(result).toBeNull();
    });
  });

  describe('logCorrection', () => {
    it('logs correction with existing training data', async () => {
      const existingData = [{ id: 'existing' }];
      mockAsyncStorage.getItem
        .mockResolvedValueOnce('profile-log') // active profile id
        .mockResolvedValueOnce(JSON.stringify(existingData)) // training data
        .mockResolvedValueOnce(JSON.stringify([])); // logs

      mockAsyncStorage.setItem.mockResolvedValue();

      await logCorrection('gesture-1');

      expect(mockAsyncStorage.setItem).toHaveBeenCalledTimes(2);
      const trainingCall = mockAsyncStorage.setItem.mock.calls[0];
      const logsCall = mockAsyncStorage.setItem.mock.calls[1];

      expect(JSON.parse(trainingCall[1])).toHaveLength(existingData.length + 1);
      expect(JSON.parse(logsCall[1])).toHaveLength(1);
    });

    it('logs correction with no existing data', async () => {
      mockAsyncStorage.getItem
        .mockResolvedValueOnce('profile-log')
        .mockResolvedValue(null);
      mockAsyncStorage.setItem.mockResolvedValue();

      await logCorrection('gesture-1');

      expect(mockAsyncStorage.setItem).toHaveBeenCalledTimes(2);
      const trainingCall = mockAsyncStorage.setItem.mock.calls[0];
      const logsCall = mockAsyncStorage.setItem.mock.calls[1];

      expect(JSON.parse(trainingCall[1])).toHaveLength(1);
      expect(JSON.parse(logsCall[1])).toHaveLength(1);
    });
  });

  describe('saveTrainingSample', () => {
    it('saves training sample to AsyncStorage and database', async () => {
      const frames: TrainingFrame[] = [
        {
          landmarks: [
            [
              [1, 2, 3],
            ],
          ],
        },
      ];

      mockAsyncStorage.getItem.mockResolvedValue(null);
      mockAsyncStorage.setItem.mockResolvedValue();

      const mockRecord = {
        gestureDefinition: { id: '' },
        landmarkData: '',
        source: '',
        qualityScore: 0,
        frameMetadata: '',
        createdAt: new Date(),
        customSyncStatus: '',
      };

      const mockCollection = {
        create: jest.fn().mockImplementation((callback) => {
          callback(mockRecord);
          return mockRecord;
        }),
      };

      mockDatabase.get.mockReturnValue(mockCollection as any);
      mockDatabase.write.mockImplementation((callback) => callback());

      const sample = createTrainingSample({
        profileId: TEST_PROFILE_ID,
        label: 'gesture-1',
        frames,
        clipUri: 'file://clip.mp4',
        source: 'HIP_4',
      });

      await saveTrainingSample(sample);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        `gestureTrainingData_${TEST_PROFILE_ID}`,
        expect.stringContaining('gesture-1'),
      );
      expect(mockEnqueue).toHaveBeenCalled();
    });
  });

  describe('rehydratePendingTrainingSamples', () => {
    it('requeues pending samples and updates stored status', async () => {
      const profileId = 'profile-rehydrate';
      const sample = {
        id: 'sample-1',
        profileId,
        label: 'gesture-1',
        frames: [],
        clipUri: 'file://clip.mp4',
        source: 'HIP_2' as const,
        capturedAt: '2023-01-01T00:00:00.000Z',
        createdAt: '2023-01-01T00:00:00.000Z',
        syncStatus: 'pending' as const,
        bundleKey: null,
      };

      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify([sample]));
      mockAsyncStorage.setItem.mockResolvedValue();
      mockEnqueue.mockResolvedValueOnce('rehydrated-bundle-key');

      await rehydratePendingTrainingSamples(profileId);

      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'sample-1' }),
        { scheduleSync: false },
      );
      expect(mockAsyncStorage.setItem).toHaveBeenCalledTimes(1);
      const [storageKey, raw] = mockAsyncStorage.setItem.mock.calls[0];
      expect(storageKey).toBe(`gestureTrainingData_${profileId}`);
      const stored = JSON.parse(raw);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        id: 'sample-1',
        syncStatus: 'queued',
        bundleKey: 'rehydrated-bundle-key',
      });
    });

    it('does not persist changes when samples are already queued', async () => {
      const profileId = 'profile-idempotent';
      const sample = {
        id: 'sample-queued',
        profileId,
        label: 'gesture-queued',
        frames: [],
        clipUri: 'file://clip.mp4',
        source: 'HIP_2' as const,
        capturedAt: '2023-01-03T00:00:00.000Z',
        createdAt: '2023-01-03T00:00:00.000Z',
        syncStatus: 'queued' as const,
        bundleKey: 'existing-bundle',
      };

      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify([sample]));

      await rehydratePendingTrainingSamples(profileId);

      expect(mockEnqueue).not.toHaveBeenCalled();
      expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('ignores synced samples without attempting to requeue', async () => {
      const profileId = 'profile-synced';
      const sample = {
        id: 'sample-synced',
        profileId,
        label: 'gesture-synced',
        frames: [],
        clipUri: '',
        source: 'HIP_2' as const,
        capturedAt: '2023-01-04T00:00:00.000Z',
        createdAt: '2023-01-04T00:00:00.000Z',
        syncStatus: 'synced' as const,
        bundleKey: null,
      };

      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify([sample]));

      await rehydratePendingTrainingSamples(profileId);

      expect(mockEnqueue).not.toHaveBeenCalled();
      expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('enqueues samples without clip URIs for degraded upload', async () => {
      const profileId = 'profile-no-clip';
      const sample = {
        id: 'sample-2',
        profileId,
        label: 'gesture-2',
        frames: [],
        clipUri: '',
        source: 'HIP_2' as const,
        capturedAt: '2023-01-02T00:00:00.000Z',
        createdAt: '2023-01-02T00:00:00.000Z',
        syncStatus: 'pending' as const,
        bundleKey: undefined,
      };

      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify([sample]));
      mockAsyncStorage.setItem.mockResolvedValue();
      mockEnqueue.mockResolvedValueOnce('bundle-key-2');

      await rehydratePendingTrainingSamples(profileId);

      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'sample-2',
          clipUri: '',
        }),
        { scheduleSync: false },
      );
      expect(mockAsyncStorage.setItem).toHaveBeenCalledTimes(1);
      const [storageKey, raw] = mockAsyncStorage.setItem.mock.calls[0];
      expect(storageKey).toBe(`gestureTrainingData_${profileId}`);
      const stored = JSON.parse(raw);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        id: 'sample-2',
        syncStatus: 'queued',
        bundleKey: 'bundle-key-2',
      });
    });
  });

  describe('loadTrainingSampleCount', () => {
    it('returns count of training samples for gesture', async () => {
      const mockData = [
        { label: 'gesture-1' },
        { label: 'gesture-2' },
        { label: 'gesture-1' },
      ];

      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(mockData));

      const count = await loadTrainingSampleCount('gesture-1');

      expect(count).toBe(2);
    });

    it('returns 0 when no data exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const count = await loadTrainingSampleCount('gesture-1');

      expect(count).toBe(0);
    });
  });

  // API Key functions
  describe('API Key functions', () => {
    it('saves OpenAI API key without error', async () => {
      await expect(saveOpenAIApiKey('test-key')).resolves.toBeUndefined();
    });

    it('loads OpenAI API key without error', async () => {
      await expect(loadOpenAIApiKey()).resolves.toBeUndefined();
    });
  });

  describe('Backend token functions', () => {
    it('saves backend API token', async () => {
      mockSecureStore.setItemAsync.mockResolvedValue();
      mockAsyncStorage.removeItem.mockResolvedValue();

      await saveBackendApiToken('token-123');

      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('backendApiToken', 'token-123');
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('backendApiToken:fallback');
    });

    it('loads backend API token', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('token-123');

      const result = await loadBackendApiToken();

      expect(result).toBe('token-123');
      expect(mockAsyncStorage.getItem).not.toHaveBeenCalled();
    });

    it('stores backend token in AsyncStorage when SecureStore is unavailable', async () => {
      mockSecureStore.setItemAsync.mockRejectedValue(new Error('unavailable'));
      mockAsyncStorage.setItem.mockResolvedValue();

      await saveBackendApiToken('token-abc');

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('backendApiToken:fallback', 'token-abc');
    });

    it('loads backend API token from fallback when SecureStore throws', async () => {
      mockSecureStore.getItemAsync.mockRejectedValue(new Error('unavailable'));
      mockAsyncStorage.getItem.mockResolvedValue('token-fallback');

      const result = await loadBackendApiToken();

      expect(result).toBe('token-fallback');
    });

    it('loads fallback token when SecureStore returns null', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null as unknown as string);
      mockAsyncStorage.getItem.mockResolvedValue('token-alt');

      const result = await loadBackendApiToken();

      expect(result).toBe('token-alt');
    });
  });

  describe('Custom model functions', () => {
    it('saves custom model URI', async () => {
      mockAsyncStorage.setItem.mockResolvedValue();

      await saveCustomModelUri('http://example.com/model');

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('customModelUri', 'http://example.com/model');
    });

    it('loads custom model URI', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('http://example.com/model');

      const result = await loadCustomModelUri();

      expect(result).toBe('http://example.com/model');
    });

    it('saves custom model hash', async () => {
      mockAsyncStorage.setItem.mockResolvedValue();

      await saveCustomModelHash('hash-123');

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('customModelHash', 'hash-123');
    });

    it('loads custom model hash', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('hash-123');

      const result = await loadCustomModelHash();

      expect(result).toBe('hash-123');
    });
  });

  describe('Custom gestures', () => {
    it('saves custom gesture when it does not exist', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      mockAsyncStorage.setItem.mockResolvedValue();

      const gesture = { id: '1', label: 'Test', emoji: '✋' };
      await saveCustomGesture(gesture);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'customGestures',
        JSON.stringify([gesture])
      );
    });

    it('does not save duplicate custom gesture', async () => {
      const existing = [{ id: '1', label: 'Existing' }];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existing));

      const gesture = { id: '1', label: 'Test', emoji: '✋' };
      await saveCustomGesture(gesture);

      expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('loads custom gestures', async () => {
      const gestures = [
        { id: '1', label: 'Test 1', emoji: '✋' },
        { id: '2', label: 'Test 2', emoji: '👋' },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(gestures));

      const result = await loadCustomGestures();

      expect(result).toEqual(gestures);
    });

    it('returns empty array when no custom gestures exist', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await loadCustomGestures();

      expect(result).toEqual([]);
    });
  });

  describe('Active profile management', () => {
    it('sets active profile ID and notifies listeners', async () => {
      const mockListener = jest.fn();
      const { onActiveProfileChange } = require('../src/storage');
      const unsubscribe = onActiveProfileChange(mockListener);

      mockAsyncStorage.setItem.mockResolvedValue();

      await setActiveProfileId('profile-1');

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('activeProfileId', 'profile-1');

      unsubscribe();
    });

    it('loads active profile ID', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('profile-1');

      const result = await loadActiveProfileId();

      expect(result).toBe('profile-1');
    });

    it('handles listener errors gracefully', async () => {
      const mockListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const { onActiveProfileChange } = require('../src/storage');
      onActiveProfileChange(mockListener);

      // Mock console.warn to avoid console output during test
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      mockAsyncStorage.setItem.mockResolvedValue();

      await setActiveProfileId('profile-1');

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('activeProfileId', 'profile-1');

      consoleWarnSpy.mockRestore();
    });

    it('removes listener when unsubscribe is called', async () => {
      const mockListener = jest.fn();
      const { onActiveProfileChange } = require('../src/storage');
      const unsubscribe = onActiveProfileChange(mockListener);

      mockAsyncStorage.setItem.mockResolvedValue();

      // Unsubscribe and then try to notify
      unsubscribe();
      await setActiveProfileId('profile-1');

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('activeProfileId', 'profile-1');
      expect(mockListener).not.toHaveBeenCalled();
    });
  });

  describe('Profile mapping edge cases', () => {
    it('handles missing successSound in profile mapping', async () => {
      const mockRecords = [
        {
          id: '1',
          name: 'Test Profile',
          consentHelpMeLearnOverTime: true,
          consentHelpMeGetSmarter: false,
          activeVocabularySet: { id: 'vocab1' },
          largeText: true,
          highContrast: false,
          // successSound is missing
        },
      ];

      const mockCollection = {
        query: jest.fn().mockReturnThis(),
        fetch: jest.fn().mockResolvedValue(mockRecords),
      };

      mockDatabase.get.mockReturnValue(mockCollection as any);

      const result = await loadProfiles();

      expect(result[0].successSound).toBe('success'); // Should default to 'success'
    });

    it('handles database errors in loadProfiles', async () => {
      const mockCollection = {
        query: jest.fn().mockReturnThis(),
        fetch: jest.fn().mockRejectedValue(new Error('Database error')),
      };

      mockDatabase.get.mockReturnValue(mockCollection as any);

      await expect(loadProfiles()).rejects.toThrow('Database error');
    });
  });

  describe('Training sample queue operations', () => {
    it('falls back to pending state when enqueue fails', async () => {
      const frames: TrainingFrame[] = [
        {
          landmarks: [
            [
              [1, 2, 3],
            ],
          ],
        },
      ];

      mockAsyncStorage.getItem.mockResolvedValue(null);
      mockAsyncStorage.setItem.mockResolvedValue();
      mockEnqueue.mockRejectedValueOnce(new Error('enqueue failed'));

      const sample = createTrainingSample({
        profileId: TEST_PROFILE_ID,
        label: 'gesture-1',
        frames,
        clipUri: 'file://clip.mp4',
      });

      const stored = await saveTrainingSample(sample);

      expect(stored.syncStatus).toBe('pending');
      expect(mockAsyncStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('AsyncStorage error handling', () => {
    it('handles AsyncStorage errors in loadActiveProfileId', async () => {
      mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

      await expect(loadActiveProfileId()).rejects.toThrow('Storage error');
    });

    it('handles AsyncStorage errors in setActiveProfileId', async () => {
      mockAsyncStorage.setItem.mockRejectedValue(new Error('Storage error'));

      await expect(setActiveProfileId('profile-1')).rejects.toThrow('Storage error');
    });
  });
});
