jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import { secureConfigManager } from '../src/services/secureConfig';

describe('SecureConfigManager', () => {
  beforeEach(() => {
    (SecureStore.getItemAsync as jest.Mock).mockReset();
    (SecureStore.setItemAsync as jest.Mock).mockReset();
    (global as any).__ae_key_warned = false;
  });

  it('stores key with hash and validates integrity', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    await secureConfigManager.setAPIKey('abc123');
    const hash = (() => {
      let h = 0;
      for (const char of 'abc123') {
        h = (h << 5) - h + char.charCodeAt(0);
        h |= 0;
      }
      return h.toString();
    })();

    expect(SecureStore.setItemAsync).toHaveBeenNthCalledWith(1, 'amys-echo-api-key', 'abc123');
    expect(SecureStore.setItemAsync).toHaveBeenNthCalledWith(2, 'amys-echo-api-key-hash', hash);

    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('abc123')
      .mockResolvedValueOnce(hash);
    const key = await secureConfigManager.getAPIKey();
    expect(key).toBe('abc123');

    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('bad')
      .mockResolvedValueOnce(hash);
    const tampered = await secureConfigManager.getAPIKey();
    expect(tampered).toBeNull();
  });
});
