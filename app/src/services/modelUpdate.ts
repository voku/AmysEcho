import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import { saveCustomModelHash } from '../storage';
import { CUSTOM_GESTURE_MODEL_PATH } from '../constants';
import { logger } from '../utils/logger';
import { fetchCentroids, fetchMlpModel } from './dgsModelClient';

export async function checkForModelUpdate(profileId?: string): Promise<boolean> {
  try {
    const net = await NetInfo.fetch();
    const allowCellular = process.env['EXPO_PUBLIC_ALLOW_CELLULAR_MODEL_UPDATES'] === 'true';

    if (!net.isConnected || net.isInternetReachable !== true) {
      return false;
    }

    if (!allowCellular && net.type !== 'wifi') {
      return false;
    }

    const refreshed = await refreshDgsModel(profileId);
    return refreshed !== null;
  } catch (error) {
    logger.warn('model refresh failed', error);
    return false;
  }
}

// Validate model integrity after update
export async function validateModelUpdate(): Promise<boolean> {
  try {
    const modelInfo = await FileSystem.getInfoAsync(CUSTOM_GESTURE_MODEL_PATH);
    if (!modelInfo.exists || modelInfo.size === 0) {
      logger.warn('Model file missing or empty after update');
      return false;
    }

    // Basic validation - check if file is readable and has reasonable size
    if (modelInfo.size < 1000) { // Models should be at least 1KB
      logger.warn('Model file suspiciously small after update');
      return false;
    }

    logger.info('Model validation passed');
    return true;
  } catch (e) {
    logger.error('Model validation failed', e);
    return false;
  }
}

// Instant rollback to previous working model
export async function rollbackModelUpdate(): Promise<boolean> {
  try {
    const backupUri = `${CUSTOM_GESTURE_MODEL_PATH}.backup`;
    const backupInfo = await FileSystem.getInfoAsync(backupUri);

    if (!backupInfo.exists) {
      logger.warn('No backup model available for rollback');
      return false;
    }

    // Restore backup as the active model
    await FileSystem.copyAsync({
      from: backupUri,
      to: CUSTOM_GESTURE_MODEL_PATH
    });

    // Clear the hash to force re-validation on next update check
    await saveCustomModelHash('');

    logger.info('Successfully rolled back to previous model');
    return true;
  } catch (e) {
    logger.error('Failed to rollback model update', e);
    return false;
  }
}

// Emergency rollback triggered by recognition failures
export async function emergencyRollback(): Promise<boolean> {
  logger.warn('Emergency rollback triggered due to recognition failures');
  const success = await rollbackModelUpdate();
  if (success) {
    // Clean up backup after successful emergency rollback
    try {
      const backupUri = `${CUSTOM_GESTURE_MODEL_PATH}.backup`;
      await FileSystem.deleteAsync(backupUri, { idempotent: true });
    } catch (e) {
      logger.warn('Failed to clean up backup after emergency rollback', e);
    }
  }
  return success;
}

// Update local DGS recognition model, preferring MLP over centroid
export async function refreshDgsModel(profileId?: string): Promise<'mlp' | 'centroid' | null> {
  const mlp = await fetchMlpModel(profileId);
  if (mlp) return 'mlp';
  const centroid = await fetchCentroids(profileId);
  return centroid ? 'centroid' : null;
}
