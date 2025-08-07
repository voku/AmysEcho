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
    this.apiKeyHash = this.hashKey(key);
    await SecureStore.setItemAsync('amys-echo-api-key', key);
    setTimeout(() => {
      key = '';
    }, 1000);
  }

  async getAPIKey(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync('amys-echo-api-key');
    } catch (error) {
      logger.error('Failed to retrieve API key:', error);
      return process.env.OPENAI_API_KEY || null;
    }
  }

  validateKeyIntegrity(): boolean {
    return this.apiKeyHash.length > 0;
  }
}

export const secureConfigManager = SecureConfigManager.getInstance();

export default SecureConfigManager;
