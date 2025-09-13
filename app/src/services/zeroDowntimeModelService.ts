import { logger } from '../utils/logger';

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

  static getInstance(): ZeroDowntimeModelService {
    if (!ZeroDowntimeModelService.instance) {
      ZeroDowntimeModelService.instance = new ZeroDowntimeModelService();
    }
    return ZeroDowntimeModelService.instance;
  }

  private constructor() {
    this.loadCurrentModel();
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

    try {
      this.updateStatus = { status: 'downloading', progress: 0, message: 'Downloading new model...' };
      this.notifyCallbacks();

      // Download model in background
      const modelData = await this.downloadModel(modelUrl, expectedSize);

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
        size: expectedSize || 0, // Use expected size or 0 if not available
        hash: await this.calculateHash(modelData),
        performanceMetrics: validationResult.metrics
      };

      this.pendingModel = newModel;

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
      if (error instanceof Error && error.message === 'Download aborted') {
        this.updateStatus = { status: 'idle', progress: 0, message: 'Update cancelled' };
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
    if (this.abortController) {
      this.abortController.abort();
      this.isUpdating = false;
      this.updateStatus = { status: 'idle', progress: 0, message: 'Update cancelled' };
      this.notifyCallbacks();
      logger.info('Model update cancelled');
    }
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
    const response = await fetch(url, {
      signal: this.abortController?.signal
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const contentLength = expectedSize || parseInt(response.headers.get('content-length') || '0');
    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error('Failed to get response reader');
    }

    const chunks: Uint8Array[] = [];
    let receivedLength = 0;

    while (true) {
      // Abort early if the operation was cancelled
      if (this.abortController?.signal.aborted) {
        throw new Error('Download aborted');
      }

      const { done, value } = await reader.read();

      if (done) break;

      chunks.push(value);
      receivedLength += value.length;

      // Update progress
      if (contentLength > 0) {
        const progress = (receivedLength / contentLength) * 75; // 75% for download phase
        this.updateStatus = {
          status: 'downloading',
          progress: Math.min(progress, 75),
          message: `Downloading... ${Math.round(progress)}%`,
          estimatedTimeRemaining: this.estimateTimeRemaining(receivedLength, contentLength)
        };
        this.notifyCallbacks();
      }
    }

    // Combine chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result.buffer;
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
    if (received === 0) return 0;

    const elapsed = Date.now() - (this.updateStatus as any).startTime || 0;
    const rate = received / elapsed; // bytes per ms
    const remaining = total - received;
    return Math.round(remaining / rate);
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
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('amys_echo_current_model', data);
      }
    } catch (error) {
      logger.warn('Failed to save current model:', error);
    }
  }

  /**
   * Load current model from persistent storage
   */
  private async loadCurrentModel(): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const data = window.localStorage.getItem('amys_echo_current_model');
        if (data) {
          this.currentModel = JSON.parse(data);
        }
      }
    } catch (error) {
      logger.warn('Failed to load current model:', error);
      this.currentModel = null;
    }
  }

  /**
   * Load backup model for rollback
   */
  private async loadBackupModel(): Promise<ModelVersion | null> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const data = window.localStorage.getItem('amys_echo_backup_model');
        return data ? JSON.parse(data) : null;
      }
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
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('amys_echo_backup_model', data);
        }
      } catch (error) {
        logger.warn('Failed to save backup model:', error);
      }
    }
  }
}

export const zeroDowntimeModelService = ZeroDowntimeModelService.getInstance();