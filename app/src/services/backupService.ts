import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { logger } from '../utils/logger';

const BACKUP_FILE = `${FileSystem.documentDirectory}protectedGesturesBackup.json`;

export const backupService = {
  async backupProtectedGestures(): Promise<string | null> {
    try {
      const data = await AsyncStorage.getItem('protectedGestures');
      if (!data) {
        logger.info('No protected gesture data to backup.');
        return null;
      }
      await FileSystem.writeAsStringAsync(BACKUP_FILE, data, {
        encoding: FileSystem.EncodingType.UTF8,
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
      const data = await FileSystem.readAsStringAsync(BACKUP_FILE, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      JSON.parse(data); // ensure valid JSON before writing
      await AsyncStorage.setItem('protectedGestures', data);
      logger.info('Backup restored.');
      return true;
    } catch (error) {
      logger.error('Error restoring backup', error);
      return false;
    }
  },
};

export const BACKUP_FILE_PATH = BACKUP_FILE;
