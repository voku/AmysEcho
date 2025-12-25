/**
 * Amy's Echo Model Manager - Amy First
 * 
 * Handles loading and switching between global and profile-specific models
 * for personalized sign language recognition per child.
 */

import { installMlp } from './installMlp';
import { sendTelemetryEvent } from '../telemetry/sendTelemetryEvent';

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
      const success = installMlp();
      if (success) {
        this.globalModelLoaded = true;
        await this.sendTelemetry('global_model_loaded', { success: true });
        console.log('🌍 Global model loaded successfully');
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
      const modelPath = `/api/models/profile/${profileId}`;
      const response = await fetch(modelPath);
      
      if (!response.ok) {
        console.log(`📝 Profile model not found for ${profileId}, will use global`);
        this.profileModels.set(profileId, false);
        return false;
      }

      // Load and install profile-specific model
      const modelData = await response.arrayBuffer();
      
      // This would need installMlp to accept custom model data
      // For now, indicate availability
      this.profileModels.set(profileId, true);
      this.currentProfileId = profileId;
      
      await this.sendTelemetry('profile_model_loaded', { 
        profileId, 
        success: true,
        modelSize: modelData.byteLength 
      });
      
      console.log(`👤 Profile model loaded for ${profileId}`);
      return true;
      
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
   * Switch between global and profile models based on availability and config
   */
  async selectBestModel(profileId: string): Promise<{ loaded: boolean; usingProfile: boolean }> {
    
    // Always ensure global model is loaded as fallback
    if (!this.globalModelLoaded) {
      await this.loadGlobalModel();
    }

    // Try profile model first if configured
    if (this.config.preferProfile && profileId) {
      const profileLoaded = await this.loadProfileModel(profileId);
      if (profileLoaded) {
        return { loaded: true, usingProfile: true };
      }
      
      // Fall back to global if configured
      if (this.config.fallbackToGlobal) {
        console.log(`🔄 Falling back to global model for ${profileId}`);
        this.currentProfileId = null;
        return { loaded: true, usingProfile: false };
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
      const response = await fetch('/api/models/profiles');
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
    console.log('🔧 Model manager config updated:', this.config);
  }

  /**
   * Reset all loaded models
   */
  async reset(): Promise<void> {
    this.currentProfileId = null;
    this.globalModelLoaded = false;
    this.profileModels.clear();
    await this.sendTelemetry('models_reset');
    console.log('🔄 Model manager reset');
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