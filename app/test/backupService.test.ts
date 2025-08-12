import { jest } from '@jest/globals';

describe('backupService', () => {
  let backupService: any;
  let gestureDataProtector: any;
  let AsyncStorage: any;
  let FileSystem: any;
  let BACKUP_FILE_PATH: string;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('expo-secure-store', () => {
      const store: Record<string, string> = {};
      return {
        getItemAsync: jest.fn(async (key: string) => store[key] ?? null),
        setItemAsync: jest.fn(async (key: string, value: string) => {
          store[key] = value;
        }),
      };
    });

    AsyncStorage = require('@react-native-async-storage/async-storage').default;
    FileSystem = require('expo-file-system');
    (FileSystem.__resetMock as any)();
    const memory: Record<string, string> = {};
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (k: string, v: string) => {
      memory[k] = v;
    });
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (k: string) => memory[k] ?? null);
    (AsyncStorage.clear as jest.Mock).mockImplementation(async () => {
      Object.keys(memory).forEach((key) => delete memory[key]);
    });

    backupService = require('../src/services/backupService').backupService;
    BACKUP_FILE_PATH = require('../src/services/backupService').BACKUP_FILE_PATH;
    gestureDataProtector = require('../src/services/dataProtection').gestureDataProtector;
  });

  it('backs up and restores protected gestures', async () => {
    await gestureDataProtector.storeGesture({
      gestureClass: 'hello',
      confidence: 0.9,
      timestamp: Date.now(),
      sessionId: 'abc',
    });

    const backupPath = await backupService.backupProtectedGestures();
    expect(backupPath).toBe(BACKUP_FILE_PATH);

    await AsyncStorage.clear();
    let stored = await AsyncStorage.getItem('protectedGestures');
    expect(stored).toBeNull();

    const restored = await backupService.restoreProtectedGestures();
    expect(restored).toBe(true);
    stored = await AsyncStorage.getItem('protectedGestures');
    expect(stored).not.toBeNull();
  });

  it('returns null when no data to backup', async () => {
    const path = await backupService.backupProtectedGestures();
    expect(path).toBeNull();
  });

  it('returns false when no backup file exists', async () => {
    const restored = await backupService.restoreProtectedGestures();
    expect(restored).toBe(false);
  });

  it('handles corrupted backup file gracefully', async () => {
    await FileSystem.writeAsStringAsync(BACKUP_FILE_PATH, 'corrupted');
    const restored = await backupService.restoreProtectedGestures();
    expect(restored).toBe(false);
    expect(await AsyncStorage.getItem('protectedGestures')).toBeNull();
  });
});
