jest.mock('expo-secure-store', () => {
  const store: Record<string, string> = {};
  return {
    getItemAsync: jest.fn(async (key: string) => store[key] ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
  };
});

import * as SecureStore from 'expo-secure-store';
import { secureConfigManager } from '../src/services/secureConfig';

describe('SecureConfigManager', () => {
  beforeEach(() => {
    (SecureStore.getItemAsync as jest.Mock).mockClear();
    (SecureStore.setItemAsync as jest.Mock).mockClear();
  });

  it('stores key with hash and validates integrity', async () => {
    await secureConfigManager.setAPIKey('abc123');
    const key = await secureConfigManager.getAPIKey();
    expect(key).toBe('abc123');

    // Tamper stored key
    await (SecureStore.setItemAsync as jest.Mock)('amys-echo-api-key', 'bad');
    const tampered = await secureConfigManager.getAPIKey();
    expect(tampered).toBeNull();
  });
});
