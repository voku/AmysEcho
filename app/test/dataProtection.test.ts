jest.mock('@react-native-async-storage/async-storage');
jest.mock('expo-secure-store', () => {
  const store: Record<string, string> = { gestureEncryptionKey: 'test-key' };
  return {
    getItemAsync: jest.fn(async (key: string) => store[key] ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import CryptoJS from 'crypto-js';
import { gestureDataProtector, GestureData } from '../src/services/dataProtection';

describe('GestureDataProtector', () => {
  beforeEach(() => {
    (AsyncStorage.setItem as jest.Mock).mockReset();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  });

  it('anonymizes and encrypts gesture data', async () => {
    const sample: GestureData = {
      gestureClass: 'wave',
      confidence: 0.9,
      timestamp: Date.now(),
      sessionId: 'session123',
    };

    await gestureDataProtector.storeGesture(sample);

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'protectedGestures',
      expect.any(String)
    );

    const stored = (AsyncStorage.setItem as jest.Mock).mock.calls[0][1];
    const records = JSON.parse(stored);
    const cipher = records[0].data;
    expect(cipher).not.toContain(sample.sessionId);

    const key = 'test-key';
    const bytes = CryptoJS.AES.decrypt(cipher, key);
    const decrypted = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    expect(decrypted.sessionId).toBe(CryptoJS.SHA256(sample.sessionId).toString());
    expect(decrypted.timestamp).toBe(
      Math.floor(sample.timestamp / (24 * 60 * 60 * 1000))
    );
  });
});
