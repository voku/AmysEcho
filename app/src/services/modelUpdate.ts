import NetInfo from '@react-native-community/netinfo';
import { logger } from '../utils/logger';
import {
  clearMlpModelBackup,
  fetchCentroids,
  fetchMlpModel,
  getCachedMlpModel,
  restoreMlpModelBackup,
} from './dgsModelClient';

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
export async function validateModelUpdate(profileId?: string): Promise<boolean> {
  try {
    const cached = await getCachedMlpModel(profileId);
    if (!cached) {
      logger.warn('MLP model missing after update', {
        profileId: profileId ?? 'global',
      });
      return false;
    }

    if (cached.length < 1000) {
      logger.warn('MLP model suspiciously small after update', {
        profileId: profileId ?? 'global',
        size: cached.length,
      });
      return false;
    }

    logger.info('Model validation passed', {
      profileId: profileId ?? 'global',
      size: cached.length,
    });
    return true;
  } catch (error) {
    logger.error('Model validation failed', error);
    return false;
  }
}

// Instant rollback to previous working model
export async function rollbackModelUpdate(profileId?: string): Promise<boolean> {
  try {
    const restored = await restoreMlpModelBackup(profileId);
    if (!restored) {
      logger.warn('No backup model available for rollback', {
        profileId: profileId ?? 'global',
      });
      return false;
    }

    logger.info('Successfully rolled back to previous model', {
      profileId: profileId ?? 'global',
    });
    return true;
  } catch (error) {
    logger.error('Failed to rollback model update', error);
    return false;
  }
}

// Emergency rollback triggered by recognition failures
export async function emergencyRollback(profileId?: string): Promise<boolean> {
  logger.warn('Emergency rollback triggered due to recognition failures', {
    profileId: profileId ?? 'global',
  });
  const success = await rollbackModelUpdate(profileId);
  if (success) {
    try {
      await clearMlpModelBackup(profileId);
    } catch (error) {
      logger.warn('Failed to clean up backup after emergency rollback', error);
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
