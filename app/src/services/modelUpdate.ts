import * as FileSystem from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import { loadBackendApiToken, saveCustomModelUri, loadCustomModelHash, saveCustomModelHash } from '../storage';
import { CUSTOM_GESTURE_MODEL_PATH } from '../constants';
import { API_URL } from '../constants';
import { logger } from '../utils/logger';
import { fetchCentroids, fetchMlpModel } from './dgsModelClient';

export async function checkForModelUpdate(profileId?: string): Promise<boolean> {
  const net = await NetInfo.fetch();
  const allowCellular =
    process.env.EXPO_PUBLIC_ALLOW_CELLULAR_MODEL_UPDATES === 'true';
  if (
    !net.isConnected ||
    net.isInternetReachable !== true ||
    (!allowCellular && net.type !== 'wifi')
  )
    return false;
  try {
    const token = await loadBackendApiToken();
    const qs = profileId ? `?profileId=${encodeURIComponent(profileId)}` : '';
    const metaRes = await fetch(`${API_URL}/model-metadata${qs}`, {
      headers: { Authorization: `Bearer ${token || ''}` },
    });
    if (!metaRes.ok) {
      logger.warn('model metadata request failed', { status: metaRes.status });
      return false;
    }
    const meta = await metaRes.json();
    if (!meta || typeof meta.sha256 !== 'string' || meta.sha256.length === 0) {
      logger.warn('invalid model metadata payload', meta);
      return false;
    }
    const currentHash = (await loadCustomModelHash()) || '';
    if (currentHash === meta.sha256) {
      return false; // up to date
    }

    // Create backup of current working model for instant rollback
    const currentUri = await FileSystem.getInfoAsync(CUSTOM_GESTURE_MODEL_PATH);
    if (currentUri.exists) {
      const backupUri = `${CUSTOM_GESTURE_MODEL_PATH}.backup`;
      await FileSystem.copyAsync({
        from: CUSTOM_GESTURE_MODEL_PATH,
        to: backupUri
      });
      logger.info('Created model backup for rollback protection');
    }

    const uri = CUSTOM_GESTURE_MODEL_PATH;
    const res = await FileSystem.downloadAsync(
      `${API_URL}/latest-model${qs}`,
      uri,
      { headers: { Authorization: `Bearer ${token || ''}` } }
    );

    // Validate the downloaded model before committing
    const isValid = await validateModelUpdate();
    if (!isValid) {
      logger.warn('Downloaded model failed validation, rolling back');
      await rollbackModelUpdate();
      return false;
    }

    await saveCustomModelUri(res.uri);
    await saveCustomModelHash(meta.sha256);
    return true;
  } catch (e) {
    logger.warn('model update failed', e);
    // Attempt instant rollback if update failed
    await rollbackModelUpdate();
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
