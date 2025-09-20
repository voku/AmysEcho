import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paths, writeAsStringAsync, readAsStringAsync } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
const { EncodingType } = FileSystem;
import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';
import { logger } from '../utils/logger';
import { gestureDataProtector } from './dataProtection';

const BACKUP_FILE = `${Paths.document.uri}protectedGesturesBackup.json`;
const EXPORT_FILE = `${Paths.document.uri}protectedGesturesExport.json`;
const PROTECTED_GESTURES_KEY = 'protectedGestures';
const BACKUP_KEY_ID = 'protectedGesturesBackupKey';

async function getOrCreateKey(): Promise<string> {
  let key = await SecureStore.getItemAsync(BACKUP_KEY_ID);
  if (!key) {
    key = CryptoJS.lib.WordArray.random(32).toString();
    await SecureStore.setItemAsync(BACKUP_KEY_ID, key as string);
  }
  return key as string;
}

export const backupService = {
  async backupProtectedGestures(): Promise<string | null> {
    try {
      const data = await AsyncStorage.getItem(PROTECTED_GESTURES_KEY);
      if (!data) {
        logger.info('No protected gesture data to backup.');
        return null;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch (parseError) {
        logger.error('Invalid JSON data found, cannot create backup', parseError);
        throw new Error('Cannot backup corrupted data');
      }
      if (!Array.isArray(parsed) && typeof parsed !== 'object') {
        logger.error('Invalid data structure for backup');
        throw new Error('Cannot backup corrupted data');
      }

      const key = await getOrCreateKey();
      const cipher = CryptoJS.AES.encrypt(data, key).toString();
      await writeAsStringAsync(BACKUP_FILE, cipher, {
        encoding: EncodingType.UTF8,
      });
      logger.info(`Backup created at ${BACKUP_FILE}`);
      return BACKUP_FILE;
    } catch (error) {
      logger.error('Error creating backup', error);
      throw error;
    }
  },

  async restoreProtectedGestures(): Promise<boolean> {
    try {
      const info = await FileSystem.getInfoAsync(BACKUP_FILE);
      if (!info.exists) {
        logger.warn('No backup file found.');
        return false;
      }

      const key = await getOrCreateKey();
      const cipher = await readAsStringAsync(BACKUP_FILE, {
        encoding: EncodingType.UTF8,
      });

      let plain: string;
      try {
        const bytes = CryptoJS.AES.decrypt(cipher, key);
        plain = bytes.toString(CryptoJS.enc.Utf8);
      } catch (err) {
        logger.error('Backup decryption failed', err);
        return false;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(plain);
      } catch (parseError) {
        logger.error('Backup file contains invalid JSON', parseError);
        return false;
      }
      if (!Array.isArray(parsed) && typeof parsed !== 'object') {
        logger.error('Backup file contains invalid data structure');
        return false;
      }

      try {
        await AsyncStorage.setItem(PROTECTED_GESTURES_KEY, plain);
      } catch (err) {
        logger.error('Failed to write restored data to AsyncStorage', err);
        return false;
      }
      logger.info('Backup restored.');
      return true;
    } catch (error) {
      logger.error('Error restoring backup', error);
      return false;
    }
  },

  async exportProtectedGestures(): Promise<string | null> {
    try {
      const raw = await AsyncStorage.getItem(PROTECTED_GESTURES_KEY);
      if (!raw) {
        logger.info('No protected gesture data to export.');
        return null;
      }

      let records: unknown;
      try {
        records = JSON.parse(raw);
      } catch (parseError) {
        logger.error('Invalid JSON data found, cannot export', parseError);
        throw new Error('Cannot export corrupted data');
      }
      if (!Array.isArray(records)) {
        logger.error('Invalid data structure for export');
        throw new Error('Cannot export corrupted data');
      }

      const decryptPromises = (records as any[]).map((r) =>
        typeof r.data === 'string'
          ? gestureDataProtector.decryptGesture(r.data)
          : Promise.resolve(null),
      );
      const results = await Promise.allSettled(decryptPromises);
      const decrypted: any[] = [];
      results.forEach((res) => {
        if (res.status === 'fulfilled' && res.value) {
          decrypted.push(res.value);
        } else if (res.status === 'rejected') {
          logger.error('Failed to decrypt gesture for export', res.reason);
        }
      });

      await writeAsStringAsync(
        EXPORT_FILE,
        JSON.stringify(decrypted, null, 2),
        { encoding: EncodingType.UTF8 },
      );
      logger.info(`Export created at ${EXPORT_FILE}`);
      return EXPORT_FILE;
    } catch (error) {
      logger.error('Error exporting gestures', error);
      throw error;
    }
  },
};

export const BACKUP_FILE_PATH = BACKUP_FILE;
export const EXPORT_FILE_PATH = EXPORT_FILE;
