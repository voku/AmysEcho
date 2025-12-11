/**
 * Zero Downtime Model Service
 * Enables hot-swapping ML models without interrupting gesture recognition
 */

import { fetchMlpModelWithFallback, type MlpModelMeta } from '../gesture/modelClient';
import { HttpError } from '../utils/http';

export interface ModelVersion {
  version: string;
  source: 'profile' | 'global';
  profileId?: string;
  loadedAt: string;
  isActive: boolean;
}

export interface ModelSwapResult {
  success: boolean;
  previousVersion?: string;
  newVersion?: string;
  error?: string;
}

type ModelUpdateCallback = (meta: MlpModelMeta, modelB64: string) => void;
type ModelErrorCallback = (error: Error) => void;

const POLL_INTERVAL_MS = 60000; // Check for updates every minute
const MAX_RETRIES = 3;

class ZeroDowntimeModelService {
  private currentVersion: ModelVersion | null = null;
  private pendingVersion: ModelVersion | null = null;
  private updateCallbacks: Set<ModelUpdateCallback> = new Set();
  private errorCallbacks: Set<ModelErrorCallback> = new Set();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  private endpoint: string = '';
  private token?: string;
  private profileId?: string;
  private retryCount = 0;

  configure(params: { endpoint: string; token?: string; profileId?: string }): void {
    this.endpoint = params.endpoint;
    this.token = params.token;
    this.profileId = params.profileId;
  }

  onModelUpdate(callback: ModelUpdateCallback): () => void {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }

  onError(callback: ModelErrorCallback): () => void {
    this.errorCallbacks.add(callback);
    return () => this.errorCallbacks.delete(callback);
  }

  private notifyUpdate(meta: MlpModelMeta, modelB64: string): void {
    this.updateCallbacks.forEach(cb => {
      try {
        cb(meta, modelB64);
      } catch (error) {
        console.warn('[ZeroDowntime] Fehler in Update-Callback:', error);
      }
    });
  }

  private notifyError(error: Error): void {
    this.errorCallbacks.forEach(cb => {
      try {
        cb(error);
      } catch (e) {
        console.warn('[ZeroDowntime] Fehler in Error-Callback:', e);
      }
    });
  }

  async loadInitialModel(): Promise<ModelSwapResult> {
    if (!this.endpoint) {
      return { success: false, error: 'Endpoint nicht konfiguriert' };
    }

    try {
      const result = await fetchMlpModelWithFallback({
        endpoint: this.endpoint,
        token: this.token,
        profileId: this.profileId,
      });

      if (!result) {
        return { success: false, error: 'Kein Modell verfügbar' };
      }

      const version: ModelVersion = {
        version: result.meta.version ?? 'unknown',
        source: result.meta.source,
        profileId: result.meta.profileId ?? undefined,
        loadedAt: new Date().toISOString(),
        isActive: true,
      };

      this.currentVersion = version;
      this.notifyUpdate(result.meta, result.b64);

      return {
        success: true,
        newVersion: version.version,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
      this.notifyError(new Error(message));
      return { success: false, error: message };
    }
  }

  async checkForUpdate(): Promise<ModelSwapResult> {
    if (!this.endpoint) {
      return { success: false, error: 'Endpoint nicht konfiguriert' };
    }

    try {
      const result = await fetchMlpModelWithFallback({
        endpoint: this.endpoint,
        token: this.token,
        profileId: this.profileId,
      });

      if (!result) {
        return { success: false, error: 'Kein Update verfügbar' };
      }

      const newVersion = result.meta.version ?? 'unknown';
      
      // Check if this is actually a new version
      if (this.currentVersion && this.currentVersion.version === newVersion) {
        return { success: true, newVersion, previousVersion: newVersion };
      }

      // Prepare new version
      this.pendingVersion = {
        version: newVersion,
        source: result.meta.source,
        profileId: result.meta.profileId ?? undefined,
        loadedAt: new Date().toISOString(),
        isActive: false,
      };

      // Hot-swap: notify listeners to update their model reference
      const previousVersion = this.currentVersion?.version;
      this.currentVersion = { ...this.pendingVersion, isActive: true };
      this.pendingVersion = null;
      this.retryCount = 0;

      console.info('[ZeroDowntime] Modell aktualisiert:', {
        von: previousVersion,
        zu: newVersion,
      });

      this.notifyUpdate(result.meta, result.b64);

      return {
        success: true,
        previousVersion,
        newVersion,
      };
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        const message = error.message;
        return { success: false, error: message };
      }

      const message = error instanceof Error ? error.message : 'Unbekannter Fehler';

      this.retryCount += 1;
      if (this.retryCount >= MAX_RETRIES) {
        this.notifyError(new Error(`Update fehlgeschlagen nach ${MAX_RETRIES} Versuchen: ${message}`));
        this.retryCount = 0;
      }

      return { success: false, error: message };
    }
  }

  startPolling(): void {
    if (this.isPolling) return;
    
    this.isPolling = true;
    this.pollTimer = setInterval(async () => {
      await this.checkForUpdate();
    }, POLL_INTERVAL_MS);

    console.info('[ZeroDowntime] Polling gestartet');
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isPolling = false;
    console.info('[ZeroDowntime] Polling gestoppt');
  }

  async forceUpdate(): Promise<ModelSwapResult> {
    this.retryCount = 0;
    return this.checkForUpdate();
  }

  getCurrentVersion(): ModelVersion | null {
    return this.currentVersion;
  }

  isUpdateAvailable(): boolean {
    return this.pendingVersion !== null;
  }

  getStatus(): {
    currentVersion: ModelVersion | null;
    pendingVersion: ModelVersion | null;
    isPolling: boolean;
    retryCount: number;
  } {
    return {
      currentVersion: this.currentVersion,
      pendingVersion: this.pendingVersion,
      isPolling: this.isPolling,
      retryCount: this.retryCount,
    };
  }

  reset(): void {
    this.stopPolling();
    this.currentVersion = null;
    this.pendingVersion = null;
    this.retryCount = 0;
    this.updateCallbacks.clear();
    this.errorCallbacks.clear();
  }
}

export const zeroDowntimeModelService = new ZeroDowntimeModelService();
