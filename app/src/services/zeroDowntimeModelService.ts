import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

import { logger } from '../utils/logger';

export class DownloadAbortedError extends Error {
  constructor(message = 'Download aborted') {
    super(message);
    this.name = 'DownloadAbortedError';
  }
}

export interface ModelUpdateStatus {
  status: 'idle' | 'downloading' | 'validating' | 'ready' | 'failed';
  progress: number;
  message: string;
  estimatedTimeRemaining?: number;
}

export interface ModelVersion {
  id: string;
  timestamp: number;
  size: number;
  hash: string;
  performanceMetrics?: {
    accuracy: number;
    latency: number;
    memoryUsage: number;
  };
}

class ZeroDowntimeModelService {
  private static instance: ZeroDowntimeModelService;
  private currentModel: ModelVersion | null = null;
  private pendingModel: ModelVersion | null = null;
  private updateStatus: ModelUpdateStatus = { status: 'idle', progress: 0, message: 'Ready' };
  private updateCallbacks: ((status: ModelUpdateStatus) => void)[] = [];
  private isUpdating = false;
  private abortController: AbortController | null = null;
  private downloadStartTime: number | null = null;
  private currentDownloadTask: FileSystem.DownloadResumable | null = null;

  private readonly STORAGE_KEYS = {
    current: 'amys_echo_current_model',
    pending: 'amys_echo_pending_model',
    backup: 'amys_echo_backup_model',
  } as const;

  static getInstance(): ZeroDowntimeModelService {
    if (!ZeroDowntimeModelService.instance) {
      ZeroDowntimeModelService.instance = new ZeroDowntimeModelService();
    }
    return ZeroDowntimeModelService.instance;
  }

  private constructor() {
    this.loadCurrentModel().catch(error => {
      logger.warn('Failed to load stored models during initialization:', error);
    });
  }

  /**
   * Start a background model update without interrupting recognition
   */
  async startBackgroundUpdate(modelUrl: string, expectedSize?: number): Promise<boolean> {
    if (this.isUpdating) {
      logger.info('Model update already in progress');
      return false;
    }

    this.isUpdating = true;
    this.abortController = new AbortController();
    const startTime = Date.now();
    this.downloadStartTime = startTime;

    try {
      this.updateStatus = { status: 'downloading', progress: 0, message: 'Downloading new model...', estimatedTimeRemaining: 0 };
      this.notifyCallbacks();

      // Download model in background
      const modelData = await this.downloadModel(modelUrl, expectedSize);
      this.downloadStartTime = null;

      this.updateStatus = { status: 'validating', progress: 75, message: 'Validating model...' };
      this.notifyCallbacks();

      // Validate the downloaded model
      const validationResult = await this.validateModel(modelData);

      if (!validationResult.valid) {
        throw new Error(`Model validation failed: ${validationResult.error}`);
      }

      // Create new model version
      const newModel: ModelVersion = {
        id: `model_${Date.now()}`,
        timestamp: Date.now(),
        size: modelData.byteLength,
        hash: await this.calculateHash(modelData),
      };

      if (validationResult.metrics) {
        newModel.performanceMetrics = validationResult.metrics;
      }

      this.pendingModel = newModel;
      await this.savePendingModel();

      this.updateStatus = {
        status: 'ready',
        progress: 100,
        message: 'New model ready for activation',
        estimatedTimeRemaining: 0
      };
      this.notifyCallbacks();

      const duration = Date.now() - startTime;
      logger.info(`Model update completed successfully in ${duration}ms`);

      return true;

    } catch (error) {
      logger.error('Model update failed:', error);
      if (error instanceof DownloadAbortedError) {
        this.updateStatus = { status: 'idle', progress: 0, message: 'Update cancelled', estimatedTimeRemaining: 0 };
      } else {
        this.updateStatus = {
          status: 'failed',
          progress: 0,
          message: `Update failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
      this.notifyCallbacks();
      return false;
    } finally {
      this.isUpdating = false;
      this.abortController = null;
      this.downloadStartTime = null;
      this.currentDownloadTask = null;
    }
  }

  /**
   * Activate the pending model (zero-downtime switch)
   */
  async activatePendingModel(): Promise<boolean> {
    if (!this.pendingModel) {
      logger.warn('No pending model to activate');
      return false;
    }

    try {
      // Perform atomic switch - this should be very fast
      const oldModel = this.currentModel;
      this.currentModel = this.pendingModel;
      this.pendingModel = null;

      // Save the new model as current
      await this.saveCurrentModel();
      await this.clearPendingModel();

      // Clean up old model in background (don't block)
      if (oldModel) {
        setTimeout(() => {
          this.cleanupOldModel(oldModel).catch(error =>
            logger.warn('Failed to cleanup old model:', error)
          );
        }, 1000);
      }

      logger.info(`Model activated successfully: ${this.currentModel.id}`);
      return true;

    } catch (error) {
      logger.error('Failed to activate pending model:', error);
      return false;
    }
  }

  /**
   * Rollback to previous model version
   */
  async rollbackModel(): Promise<boolean> {
    try {
      // Load previous model from backup
      const backupModel = await this.loadBackupModel();

      if (!backupModel) {
        logger.warn('No backup model available for rollback');
        return false;
      }

      // Atomic switch to backup
      this.currentModel = backupModel;
      this.pendingModel = null;

      await this.saveCurrentModel();
      await this.clearPendingModel();

      logger.info(`Model rolled back to: ${backupModel.id}`);
      return true;

    } catch (error) {
      logger.error('Model rollback failed:', error);
      return false;
    }
  }

  /**
   * Get current update status
   */
  getUpdateStatus(): ModelUpdateStatus {
    return { ...this.updateStatus };
  }

  /**
   * Subscribe to update status changes
   */
  onUpdateStatus(callback: (status: ModelUpdateStatus) => void): () => void {
    this.updateCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.updateCallbacks.indexOf(callback);
      if (index > -1) {
        this.updateCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Cancel ongoing update
   */
  cancelUpdate(): void {
    if (!this.abortController && !this.currentDownloadTask) {
      return;
    }

    this.abortController?.abort();
    if (this.currentDownloadTask) {
      void this.currentDownloadTask.cancelAsync().catch(error => {
        logger.warn('Failed to cancel download task:', error);
      });
    }

    this.isUpdating = false;
    this.updateStatus = { status: 'idle', progress: 0, message: 'Update cancelled', estimatedTimeRemaining: 0 };
    this.downloadStartTime = null;
    this.notifyCallbacks();
    logger.info('Model update cancelled');
  }

  /**
   * Check if update is in progress
   */
  isUpdateInProgress(): boolean {
    return this.isUpdating;
  }

  /**
   * Get current model info
   */
  getCurrentModel(): ModelVersion | null {
    return this.currentModel;
  }

  /**
   * Get pending model info
   */
  getPendingModel(): ModelVersion | null {
    return this.pendingModel;
  }

  /**
   * Download model with progress tracking
   */
  private async downloadModel(url: string, expectedSize?: number): Promise<ArrayBuffer> {
    const directory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!directory) {
      throw new Error('No writable directory available for downloads');
    }

    const normalizedDirectory = directory.endsWith('/') ? directory : `${directory}/`;
    const fileUri = `${normalizedDirectory}model_${Date.now()}`;

    const downloadResumable = FileSystem.createDownloadResumable(
      url,
      fileUri,
      {},
      ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        const total = totalBytesExpectedToWrite || expectedSize || 0;

        if (total > 0) {
          const progress = (totalBytesWritten / total) * 75;
          this.updateStatus = {
            status: 'downloading',
            progress: Math.min(progress, 75),
            message: `Downloading... ${Math.round(progress)}%`,
            estimatedTimeRemaining: this.estimateTimeRemaining(totalBytesWritten, total)
          };
        } else {
          this.updateStatus = {
            status: 'downloading',
            progress: 0,
            message: 'Downloading...',
            estimatedTimeRemaining: undefined
          };
        }

        this.notifyCallbacks();
      }
    );

    this.currentDownloadTask = downloadResumable;

    let abortError: DownloadAbortedError | null = null;
    const abortSignal = this.abortController?.signal ?? null;
    const handleAbort = () => {
      abortError = new DownloadAbortedError();
      void downloadResumable.cancelAsync().catch(error => {
        logger.warn('Failed to cancel download task during abort:', error);
      });
    };

    abortSignal?.addEventListener('abort', handleAbort, { once: true });

    let downloadResult: FileSystem.FileSystemDownloadResult | null = null;

    try {
      downloadResult = await downloadResumable.downloadAsync();

      if (!downloadResult) {
        throw new Error('Download failed to produce a result');
      }

      if (abortError) {
        throw abortError;
      }

      const info = await FileSystem.getInfoAsync(downloadResult.uri);
      if (!info.exists) {
        throw new Error('Downloaded file not found');
      }

      const base64 = await FileSystem.readAsStringAsync(downloadResult.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const buffer = this.base64ToArrayBuffer(base64);

      await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true });

      return buffer;
    } catch (error) {
      if (abortError) {
        throw abortError;
      }

      await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
      throw error;
    } finally {
      abortSignal?.removeEventListener('abort', handleAbort);
      this.currentDownloadTask = null;
    }
  }

  /**
   * Validate downloaded model
   */
  private async validateModel(modelData: ArrayBuffer): Promise<{
    valid: boolean;
    error?: string;
    metrics?: ModelVersion['performanceMetrics']
  }> {
    try {
      // Basic validation - check if it's a valid model file
      if (modelData.byteLength === 0) {
        return { valid: false, error: 'Model file is empty' };
      }

      // Check minimum size (arbitrary threshold)
      if (modelData.byteLength < 1024) {
        return { valid: false, error: 'Model file too small' };
      }

      // Here you would add more sophisticated validation
      // For example, try to load it with your ML framework

      return {
        valid: true,
        metrics: {
          accuracy: 0.85, // Placeholder - would be measured during validation
          latency: 50,    // Placeholder
          memoryUsage: modelData.byteLength
        }
      };

    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation failed'
      };
    }
  }

  /**
   * Calculate hash of model data
   */
  private async calculateHash(data: ArrayBuffer): Promise<string> {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (_error) {
      // Fallback for environments without crypto.subtle
      return `fallback_${Date.now()}_${data.byteLength}`;
    }
  }

  /**
   * Estimate time remaining for download
   */
  private estimateTimeRemaining(received: number, total: number): number {
    if (received === 0 || total === 0) return 0;
    if (!this.downloadStartTime) return 0;

    const elapsed = Date.now() - this.downloadStartTime;
    if (elapsed <= 0) {
      return 0;
    }

    const rate = received / elapsed; // bytes per ms
    if (rate <= 0) {
      return 0;
    }

    const remaining = total - received;
    if (remaining <= 0) {
      return 0;
    }

    return Math.max(0, Math.round(remaining / rate));
  }

  /**
   * Notify all callbacks of status change
   */
  private notifyCallbacks(): void {
    this.updateCallbacks.forEach(callback => {
      try {
        callback(this.updateStatus);
      } catch (error) {
        logger.warn('Update callback failed:', error);
      }
    });
  }

  /**
   * Save current model to persistent storage
   */
  private async saveCurrentModel(): Promise<void> {
    if (!this.currentModel) return;

    try {
      const data = JSON.stringify(this.currentModel);
      await AsyncStorage.setItem(this.STORAGE_KEYS.current, data);
    } catch (error) {
      logger.warn('Failed to save current model:', error);
    }
  }

  /**
   * Load current model from persistent storage
   */
  private async loadCurrentModel(): Promise<void> {
    try {
      const [currentData, pendingData] = await Promise.all([
        AsyncStorage.getItem(this.STORAGE_KEYS.current),
        AsyncStorage.getItem(this.STORAGE_KEYS.pending),
      ]);

      this.currentModel = currentData ? JSON.parse(currentData) : null;
      this.pendingModel = pendingData ? JSON.parse(pendingData) : null;
    } catch (error) {
      logger.warn('Failed to load current model:', error);
      this.currentModel = null;
      this.pendingModel = null;
    }
  }

  /**
   * Load backup model for rollback
   */
  private async loadBackupModel(): Promise<ModelVersion | null> {
    try {
      const data = await AsyncStorage.getItem(this.STORAGE_KEYS.backup);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.warn('Failed to load backup model:', error);
    }
    return null;
  }

  /**
   * Cleanup old model files
   */
  private async cleanupOldModel(model: ModelVersion): Promise<void> {
    // Here you would clean up old model files from storage
    // For now, just log the cleanup
    logger.info(`Cleaning up old model: ${model.id}`);

    // Save current as backup before cleanup
    if (this.currentModel) {
      try {
        const data = JSON.stringify(this.currentModel);
        await AsyncStorage.setItem(this.STORAGE_KEYS.backup, data);
      } catch (error) {
        logger.warn('Failed to save backup model:', error);
      }
    }
  }

  private async savePendingModel(): Promise<void> {
    if (!this.pendingModel) return;

    try {
      const data = JSON.stringify(this.pendingModel);
      await AsyncStorage.setItem(this.STORAGE_KEYS.pending, data);
    } catch (error) {
      logger.warn('Failed to save pending model:', error);
    }
  }

  private async clearPendingModel(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.STORAGE_KEYS.pending);
    } catch (error) {
      logger.warn('Failed to clear pending model:', error);
    }
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const globalObj = globalThis as Record<string, unknown>;
    const BufferCtor = globalObj.Buffer as | undefined | {
      from: (input: string, encoding: string) => {
        buffer: ArrayBuffer;
        byteOffset: number;
        byteLength: number;
      };
    };

    if (BufferCtor) {
      const buffer = BufferCtor.from(base64, 'base64');
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }

    const atobFn = globalObj.atob as ((input: string) => string) | undefined;
    if (typeof atobFn === 'function') {
      const binaryString = atobFn(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i += 1) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }

    throw new Error('No base64 decoder available in this environment');
  }
}

export const zeroDowntimeModelService = ZeroDowntimeModelService.getInstance();