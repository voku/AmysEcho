import * as SecureStore from 'expo-secure-store';
import { logger } from '../utils/logger';

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString();
}

class SecureConfigManager {
  private static instance: SecureConfigManager;
  private apiKeyHash = '';

  static getInstance(): SecureConfigManager {
    if (!SecureConfigManager.instance) {
      SecureConfigManager.instance = new SecureConfigManager();
    }
    return SecureConfigManager.instance;
  }

  private hashKey(key: string): string {
    return simpleHash(key);
  }

  async setAPIKey(key: string): Promise<void> {
    const hash = this.hashKey(key);
    this.apiKeyHash = hash;
    await SecureStore.setItemAsync('amys-echo-api-key', key);
    await SecureStore.setItemAsync('amys-echo-api-key-hash', hash);
    setTimeout(() => {
      key = '';
    }, 1000);
  }

  async getAPIKey(): Promise<string | null> {
    try {
      const key = await SecureStore.getItemAsync('amys-echo-api-key');
      const storedHash = await SecureStore.getItemAsync('amys-echo-api-key-hash');
      if (key && storedHash && this.hashKey(key) === storedHash) {
        return key;
      }
      logger.error('API key integrity check failed');
      return null;
    } catch (error) {
      logger.error('Failed to retrieve API key:', error);
      return process.env.OPENAI_API_KEY || null;
    }
  }

  async validateKeyIntegrity(): Promise<boolean> {
    const key = await SecureStore.getItemAsync('amys-echo-api-key');
    const hash = await SecureStore.getItemAsync('amys-echo-api-key-hash');
    return !!(key && hash && this.hashKey(key) === hash);
  }
}

export const secureConfigManager = SecureConfigManager.getInstance();

export default SecureConfigManager;
