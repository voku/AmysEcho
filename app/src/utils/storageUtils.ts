/**
 * Storage utilities for Amy's Echo app
 * Provides consistent AsyncStorage patterns with error handling
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';
import { withErrorHandling, safeJsonParse, safeJsonStringify } from './errorUtils';

export interface StorageOptions {
  prefix?: string;
}

/**
 * Storage utility class with consistent error handling
 */
export class StorageManager {
  private prefix: string;

  constructor(options: StorageOptions = {}) {
    this.prefix = options.prefix || 'amys_echo';
  }

  private getKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  /**
   * Stores a string value
   */
  async setString(key: string, value: string): Promise<boolean> {
    const fullKey = this.getKey(key);
    const result = await withErrorHandling(
      () => AsyncStorage.setItem(fullKey, value),
      `Storage setString ${key}`
    );

    if (result.success) {
      logger.debug(`Stored string for key: ${key}`);
    }

    return result.success;
  }

  /**
   * Retrieves a string value
   */
  async getString(key: string, defaultValue?: string): Promise<string | null> {
    const fullKey = this.getKey(key);
    const result = await withErrorHandling(
      () => AsyncStorage.getItem(fullKey),
      `Storage getString ${key}`
    );

    if (!result.success) {
      return defaultValue || null;
    }

    return result.data || defaultValue || null;
  }

  /**
   * Stores an object as JSON
   */
  async setObject<T = any>(key: string, value: T): Promise<boolean> {
    const stringifyResult = safeJsonStringify(value, '{}', `Storage setObject ${key}`);

    if (!stringifyResult.success) {
      return false;
    }

    return this.setString(key, stringifyResult.data!);
  }

  /**
   * Retrieves an object from JSON
   */
  async getObject<T = any>(key: string, defaultValue?: T): Promise<T | null> {
    const stringValue = await this.getString(key);

    if (stringValue === null) {
      return defaultValue || null;
    }

    const parseResult = safeJsonParse<T>(stringValue, defaultValue, `Storage getObject ${key}`);

    if (!parseResult.success) {
      return defaultValue || null;
    }

    return parseResult.data || defaultValue || null;
  }

  /**
   * Stores an array
   */
  async setArray<T = any>(key: string, value: T[]): Promise<boolean> {
    return this.setObject(key, value);
  }

  /**
   * Retrieves an array
   */
  async getArray<T = any>(key: string, defaultValue: T[] = []): Promise<T[]> {
    const result = await this.getObject<T[]>(key, defaultValue);
    return Array.isArray(result) ? result : defaultValue;
  }

  /**
   * Removes a value
   */
  async remove(key: string): Promise<boolean> {
    const fullKey = this.getKey(key);
    const result = await withErrorHandling(
      () => AsyncStorage.removeItem(fullKey),
      `Storage remove ${key}`
    );

    if (result.success) {
      logger.debug(`Removed storage key: ${key}`);
    }

    return result.success;
  }

  /**
   * Clears all values with the current prefix
   */
  async clear(): Promise<boolean> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const prefixedKeys = keys.filter(key => key.startsWith(`${this.prefix}:`));

      if (prefixedKeys.length > 0) {
        await AsyncStorage.multiRemove(prefixedKeys);
        logger.info(`Cleared ${prefixedKeys.length} storage keys with prefix: ${this.prefix}`);
      }

      return true;
    } catch (error) {
      logger.error(`Failed to clear storage with prefix ${this.prefix}:`, error);
      return false;
    }
  }

  /**
   * Gets all keys with the current prefix
   */
  async getAllKeys(): Promise<string[]> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      return keys
        .filter(key => key.startsWith(`${this.prefix}:`))
        .map(key => key.replace(`${this.prefix}:`, ''));
    } catch (error) {
      logger.error(`Failed to get all keys with prefix ${this.prefix}:`, error);
      return [];
    }
  }

  /**
   * Checks if a key exists
   */
  async exists(key: string): Promise<boolean> {
    const value = await this.getString(key);
    return value !== null;
  }

  /**
   * Gets storage usage information
   */
  async getStorageInfo(): Promise<{
    totalKeys: number;
    totalSize: number;
    keys: string[];
  }> {
    try {
      const keys = await this.getAllKeys();
      let totalSize = 0;

      for (const key of keys) {
        const value = await this.getString(key);
        if (value) {
          totalSize += value.length;
        }
      }

      return {
        totalKeys: keys.length,
        totalSize,
        keys
      };
    } catch (error) {
      logger.error('Failed to get storage info:', error);
      return {
        totalKeys: 0,
        totalSize: 0,
        keys: []
      };
    }
  }
}

// Default storage manager instance
export const storageManager = new StorageManager();

// Convenience functions for common use cases
export const storage = {
  // Profile management
  async saveProfile(profileId: string, profile: any): Promise<boolean> {
    return storageManager.setObject(`profile_${profileId}`, profile);
  },

  async getProfile(profileId: string): Promise<any> {
    return storageManager.getObject(`profile_${profileId}`);
  },

  // Gesture data
  async saveGestureHistory(history: any[]): Promise<boolean> {
    return storageManager.setArray('gesture_history', history);
  },

  async getGestureHistory(): Promise<any[]> {
    return storageManager.getArray('gesture_history');
  },

  // Settings
  async saveSettings(settings: any): Promise<boolean> {
    return storageManager.setObject('settings', settings);
  },

  async getSettings(): Promise<any> {
    return storageManager.getObject('settings', {});
  },

  // Training data
  async saveTrainingData(data: any): Promise<boolean> {
    return storageManager.setObject('training_data', data);
  },

  async getTrainingData(): Promise<any> {
    return storageManager.getObject('training_data');
  },

  // Analytics
  async saveAnalyticsData(data: any): Promise<boolean> {
    return storageManager.setObject('analytics', data);
  },

  async getAnalyticsData(): Promise<any> {
    return storageManager.getObject('analytics', {});
  }
};