jest.mock('expo-secure-store', () => {
  const store: Record<string, string> = {};
  return {
    getItemAsync: jest.fn(async (key: string) => store[key] ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { backupService } from '../src/services/backupService';
import { gestureDataProtector } from '../src/services/dataProtection';

describe('backupService', () => {
  beforeEach(() => {
    (FileSystem.__resetMock as any)();
    const memory: Record<string, string> = {};
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (k: string, v: string) => {
      memory[k] = v;
    });
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (k: string) => memory[k] ?? null);
    (AsyncStorage.clear as jest.Mock).mockImplementation(async () => {
      Object.keys(memory).forEach((key) => delete memory[key]);
    });
  });

  it('backs up and restores protected gestures', async () => {
    await gestureDataProtector.storeGesture({
      gestureClass: 'hello',
      confidence: 0.9,
      timestamp: Date.now(),
      sessionId: 'abc',
    });

    const backupPath = await backupService.backupProtectedGestures();
    expect(backupPath).toBe(FileSystem.documentDirectory + 'protectedGesturesBackup.json');

    await AsyncStorage.clear();
    let stored = await AsyncStorage.getItem('protectedGestures');
    expect(stored).toBeNull();

    const restored = await backupService.restoreProtectedGestures();
    expect(restored).toBe(true);
    stored = await AsyncStorage.getItem('protectedGestures');
    expect(stored).not.toBeNull();
  });
});
