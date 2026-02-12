/**
 * Amy's Echo Model Manager - Amy First
 * 
 * Handles loading and switching between global and profile-specific models
 * for personalized sign language recognition per child.
 */

import { installMlp } from './installMlp';
import { sendTelemetryEvent } from '../telemetry/sendTelemetryEvent';
import { updatePriorityFactors } from './utils/landmarkNormalizer';
import { logger } from '../services/logger';

export interface ProfileModelInfo {
  profileId: string;
  modelAvailable: boolean;
  lastUpdated?: Date;
  gestureCount?: number;
  accuracy?: number;
}

export interface ModelSelectionConfig {
  preferProfile: boolean;
  fallbackToGlobal: boolean;
  minSamplesForProfile: number;
}


function resolveApiUrl(path: string): string {
  const envBase = import.meta.env['VITE_API_URL']?.trim();
  const normalizedBase = envBase ? envBase.replace(/\/+$/, '') : '';
  if (!normalizedBase) {
    return path;
  }
  return `${normalizedBase}${path}`;
}

class ModelManager {
  private currentProfileId: string | null = null;
  private globalModelLoaded = false;
  private profileModels = new Map<string, boolean>();
  private config: ModelSelectionConfig = {
    preferProfile: true,
    fallbackToGlobal: true,
    minSamplesForProfile: 10
  };

  /**
   * Load global model for fallback usage
   */
  async loadGlobalModel(): Promise<boolean> {
    try {
      const loaded = await installMlp();
      if (loaded) {
        this.globalModelLoaded = true;
        await this.sendTelemetry('global_model_loaded', { success: true });
        logger.info('🌍 Global model loaded successfully');
        return true;
      }
    } catch (error) {
      console.error('❌ Failed to load global model:', error);
      await this.sendTelemetry('global_model_loaded', { success: false, error: String(error) });
    }
    return false;
  }

  /**
   * Load profile-specific model for a child
   */
  async loadProfileModel(profileId: string): Promise<boolean> {
    try {
      // Check if profile model file exists
      const modelPath = resolveApiUrl(`/api/v1/models/latest?profileId=${encodeURIComponent(profileId)}`);
      const response = await fetch(modelPath);
      
      if (!response.ok) {
        console.log(`📝 Profile model not found for ${profileId}, will use global`);
        this.profileModels.set(profileId, false);
        return false;
      }

      // Load and install profile-specific model
      const modelData = await response.arrayBuffer();
      
      // Convert ArrayBuffer to base64
      const bytes = new Uint8Array(modelData);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]!);
      }
      const b64 = btoa(binary);

      // Install the profile model
      const installed = await installMlp(b64);
      
      if (installed) {
        this.profileModels.set(profileId, true);
        this.currentProfileId = profileId;
        
        await this.sendTelemetry('profile_model_loaded', { 
          profileId, 
          success: true,
          modelSize: modelData.byteLength 
        });
        
        console.log(`👤 Profile model loaded for ${profileId}`);
        return true;
      } else {
        throw new Error('MLP installation failed');
      }
      
    } catch (error) {
      console.error(`❌ Failed to load profile model for ${profileId}:`, error);
      this.profileModels.set(profileId, false);
      await this.sendTelemetry('profile_model_loaded', { 
        profileId, 
        success: false, 
        error: String(error) 
      });
      return false;
    }
  }

  /**
   * Get current active model metadata
   */
  getCurrentModelInfo(): { type: 'global' | 'profile'; profileId?: string } {
    if (this.currentProfileId && this.profileModels.get(this.currentProfileId)) {
      return { type: 'profile', profileId: this.currentProfileId };
    }
    return { type: 'global' };
  }

  /**
   * Load normalization configuration from server
   */
  async loadNormalizationConfig(): Promise<void> {
    try {
      const response = await fetch(resolveApiUrl('/api/v1/config/normalization'));
      if (response.ok) {
        const config = await response.json();
        if (config.priority_factors) {
          updatePriorityFactors(config.priority_factors);
          logger.info('🔧 Normalization priority factors updated:', config.priority_factors);
        }
      }
    } catch (error) {
      console.warn('Failed to load normalization config:', error);
    }
  }

  /**
   * Switch between global and profile models based on availability and config
   */
  async selectBestModel(profileId: string): Promise<{ loaded: boolean; usingProfile: boolean }> {
    
    // Ensure normalization config is loaded
    await this.loadNormalizationConfig();

    // Always ensure global model is loaded as fallback
    if (!this.globalModelLoaded) {
      const globalLoaded = await this.loadGlobalModel();
      if (!globalLoaded && !this.config.preferProfile) {
        return { loaded: false, usingProfile: false };
      }
    }

    // Try profile model first if configured
    if (this.config.preferProfile && profileId) {
      const profileLoaded = await this.loadProfileModel(profileId);
      if (profileLoaded) {
        return { loaded: true, usingProfile: true };
      }
      
      // Fall back to global if configured
      if (this.config.fallbackToGlobal && this.globalModelLoaded) {
        logger.info(`🔄 Falling back to global model for ${profileId}`);
        this.currentProfileId = null;
        return { loaded: true, usingProfile: false };
      }

      // Global model not available
      if (!this.globalModelLoaded) {
        return { loaded: false, usingProfile: false };
      }
    }

    return { 
      loaded: this.globalModelLoaded, 
      usingProfile: false 
    };
  }

  /**
   * Get available profile models info
   */
  async getAvailableProfileModels(): Promise<ProfileModelInfo[]> {
    try {
      const response = await fetch(resolveApiUrl('/api/models/profiles'));
      if (!response.ok) return [];
      
      const profiles: ProfileModelInfo[] = await response.json();
      return profiles.map(p => ({
        ...p,
        modelAvailable: this.profileModels.get(p.profileId) || false
      }));
    } catch (error) {
      console.error('Failed to get profile models:', error);
      return [];
    }
  }

  /**
   * Update model selection configuration
   */
  updateConfig(config: Partial<ModelSelectionConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('🔧 Model manager config updated:', this.config);
  }

  /**
   * Reset all loaded models
   */
  async reset(): Promise<void> {
    this.currentProfileId = null;
    this.globalModelLoaded = false;
    this.profileModels.clear();
    await this.sendTelemetry('models_reset');
    logger.info('🔄 Model manager reset');
  }

  /**
   * Send telemetry events
   */
  private async sendTelemetry(event: string, data?: Record<string, unknown>): Promise<void> {
    try {
      await sendTelemetryEvent(event, data ?? {});
    } catch (error) {
      console.warn(`Failed to send telemetry for ${event}:`, error);
    }
  }

  /**
   * Get performance metrics for current model
   */
  async getModelMetrics(): Promise<Record<string, unknown>> {
    const current = this.getCurrentModelInfo();
    
    return {
      currentModelType: current.type,
      currentProfileId: current.profileId,
      globalModelLoaded: this.globalModelLoaded,
      availableProfiles: Array.from(this.profileModels.entries()).map(([id, available]) => ({
        profileId: id,
        available
      })),
      config: this.config
    };
  }
}

// Singleton instance for app-wide usage
export const modelManager = new ModelManager();

// Export types and utilities
export type { ModelManager };
export default modelManager;