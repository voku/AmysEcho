import { jest } from '@jest/globals';

describe('backupService', () => {
  let backupService: any;
  let gestureDataProtector: any;
  let AsyncStorage: any;
  let FileSystem: any;
  let BACKUP_FILE_PATH: string;
  let EXPORT_FILE_PATH: string;

  beforeEach(() => {
    jest.resetModules();

    const fileStore: Record<string, string> = {};

    // Mock FileSystem with simple in-memory store before importing constants
    jest.doMock('expo-file-system', () => ({
      documentDirectory: '/test/documents/',
      cacheDirectory: '/test/cache/',
      Paths: {
        document: { uri: '/test/documents/' },
        cache: { uri: '/test/cache/' },
      },
      writeAsStringAsync: jest.fn(async (path: string, content: string) => {
        fileStore[path] = content;
      }),
      readAsStringAsync: jest.fn(async (path: string) => fileStore[path] ?? ''),
      getInfoAsync: jest.fn(async (path: string) => ({ exists: Object.prototype.hasOwnProperty.call(fileStore, path) })),
      deleteAsync: jest.fn(async (path: string) => { delete fileStore[path]; }),
      makeDirectoryAsync: jest.fn(async (_path: string) => {}),
      moveAsync: jest.fn(async (_config: any) => {}),
      __resetMock: jest.fn(() => { Object.keys(fileStore).forEach(k => delete fileStore[k]); }),
    }));

    jest.doMock('expo-file-system/legacy', () => ({
      EncodingType: { UTF8: 'utf8' },
      getInfoAsync: jest.fn(async (path: string) => ({ exists: Object.prototype.hasOwnProperty.call(fileStore, path) })),
      writeAsStringAsync: jest.fn(async (path: string, content: string) => { fileStore[path] = content; }),
      readAsStringAsync: jest.fn(async (path: string) => fileStore[path] ?? ''),
      deleteAsync: jest.fn(async (path: string) => { delete fileStore[path]; }),
      makeDirectoryAsync: jest.fn(async (_path: string) => {}),
      moveAsync: jest.fn(async (_config: any) => {}),
      documentDirectory: '/test/documents/',
      cacheDirectory: '/test/cache/',
      Paths: {
        document: { uri: '/test/documents/' },
        cache: { uri: '/test/cache/' },
      },
    }));

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

    const memory: Record<string, string> = {};
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (k: string, v: string) => {
      memory[k] = v;
    });
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (k: string) => memory[k] ?? null);
    if (typeof AsyncStorage.clear === 'function') {
      (AsyncStorage.clear as jest.Mock).mockImplementation(async () => {
        Object.keys(memory).forEach((k) => delete memory[k]);
      });
    }

    // Mock constants that depend on FileSystem
    jest.doMock('../src/constants', () => ({
      BASE_DIR: '/test/documents/',
      CUSTOM_GESTURE_MODEL_PATH: '/test/documents/custom_model.json',
      BACKUP_FILE_PATH: '/test/documents/backup.json',
      EXPORT_FILE_PATH: '/test/documents/export.json',
    }));

    backupService = require('../src/services/backupService').backupService;
    const paths = require('../src/services/backupService');
    BACKUP_FILE_PATH = paths.BACKUP_FILE_PATH;
    EXPORT_FILE_PATH = paths.EXPORT_FILE_PATH;
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

  it('exports decrypted gestures', async () => {
    await gestureDataProtector.storeGesture({
      gestureClass: 'hi',
      confidence: 0.8,
      timestamp: Date.now(),
      sessionId: 'xyz',
    });

    const path = await backupService.exportProtectedGestures();
    expect(path).toBe(EXPORT_FILE_PATH);
    const content = await FileSystem.readAsStringAsync(EXPORT_FILE_PATH);
    const parsed = JSON.parse(content);
    expect(parsed.length).toBe(1);
    expect(parsed[0].gestureClass).toBe('hi');
  });
});
