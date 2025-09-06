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
} from '../src/storage';

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

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;
const mockDatabase = database as jest.Mocked<typeof database>;

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
        .mockResolvedValueOnce(JSON.stringify(existingData)) // training data
        .mockResolvedValueOnce(JSON.stringify([])); // logs

      mockAsyncStorage.setItem.mockResolvedValue();

      await logCorrection('gesture-1');

      expect(mockAsyncStorage.setItem).toHaveBeenCalledTimes(2);
      const trainingCall = mockAsyncStorage.setItem.mock.calls[0];
      const logsCall = mockAsyncStorage.setItem.mock.calls[1];

      expect(JSON.parse(trainingCall[1])).toHaveLength(2);
      expect(JSON.parse(logsCall[1])).toHaveLength(1);
    });

    it('logs correction with no existing data', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
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
          landmarks: [[[1, 2, 3]]],
          handedness: ['Left'],
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

      await saveTrainingSample('gesture-1', frames, 'HIP_4');

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'gestureTrainingData',
        expect.stringContaining('gesture-1')
      );
      expect(mockCollection.create).toHaveBeenCalled();
      expect(mockRecord.gestureDefinition.id).toBe('gesture-1');
    });
  });

  describe('loadTrainingSampleCount', () => {
    it('returns count of training samples for gesture', async () => {
      const mockData = [
        { gestureDefinitionId: 'gesture-1' },
        { gestureDefinitionId: 'gesture-2' },
        { gestureDefinitionId: 'gesture-1' },
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

  describe('API Key functions', () => {
    it('saves OpenAI API key', async () => {
      const { secureConfigManager } = require('../src/services/secureConfig');
      secureConfigManager.setAPIKey.mockResolvedValue();

      await saveOpenAIApiKey('test-key');

      expect(secureConfigManager.setAPIKey).toHaveBeenCalledWith('test-key');
    });

    it('loads OpenAI API key', async () => {
      const { secureConfigManager } = require('../src/services/secureConfig');
      secureConfigManager.getAPIKey.mockResolvedValue('test-key');

      const result = await loadOpenAIApiKey();

      expect(result).toBe('test-key');
    });
  });

  describe('Backend token functions', () => {
    it('saves backend API token', async () => {
      mockSecureStore.setItemAsync.mockResolvedValue();

      await saveBackendApiToken('token-123');

      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('backendApiToken', 'token-123');
    });

    it('loads backend API token', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('token-123');

      const result = await loadBackendApiToken();

      expect(result).toBe('token-123');
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
      expect(mockListener).toHaveBeenCalledWith('profile-1');

      unsubscribe();
    });

    it('loads active profile ID', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('profile-1');

      const result = await loadActiveProfileId();

      expect(result).toBe('profile-1');
    });
  });
});