/**
 * Amy's Echo Performance Feedback System
 * 
 * Collects real-world inference performance metrics and sends them
 * back to the training pipeline for continuous improvement.
 * 
 * Amy First: Every prediction improves future models
 */

import { sendTelemetryEvent } from '../telemetry/sendTelemetryEvent';
import { modelManager } from './modelManager';

export interface PredictionResult {
  label: string;
  score: number;
  timestamp: number;
  gestureId?: string;
  profileId?: string;
  modelType: 'global' | 'profile';
  confidence: number;
  processingTime: number;
  context?: {
    lighting?: 'good' | 'moderate' | 'poor';
    handVisibility?: 'both' | 'one' | 'none';
    gestureComplexity?: 'simple' | 'moderate' | 'complex';
    userFatigue?: 'low' | 'medium' | 'high';
  };
}

export interface PerformanceMetrics {
  totalPredictions: number;
  accuracyScore: number;
  averageConfidence: number;
  averageProcessingTime: number;
  modelSwitches: number;
  errors: number;
  lastUpdate: Date;
  gesturalPatterns: Map<string, number>;
  contextualFactors: Record<string, number>;
}

class PerformanceFeedback {
  private metrics: PerformanceMetrics = {
    totalPredictions: 0,
    accuracyScore: 0,
    averageConfidence: 0,
    averageProcessingTime: 0,
    modelSwitches: 0,
    errors: 0,
    lastUpdate: new Date(),
    gesturalPatterns: new Map(),
    contextualFactors: {}
  };
  
  private recentPredictions: PredictionResult[] = [];
  private readonly MAX_RECENT_PREDICTIONS = 100;
  private readonly BATCH_SIZE = 20; // Send feedback every 20 predictions
  
  /**
   * Record a prediction result for performance tracking
   */
  recordPrediction(result: PredictionResult): void {
    try {
      // Add to recent predictions
      this.recentPredictions.push(result);
      
      // Keep only recent predictions
      if (this.recentPredictions.length > this.MAX_RECENT_PREDICTIONS) {
        this.recentPredictions.shift();
      }
      
      // Update metrics
      this.updateMetrics(result);
      
      // Send batch feedback
      if (this.recentPredictions.length % this.BATCH_SIZE === 0) {
        void this.sendFeedbackBatch();
      }
      
    } catch (error) {
      console.warn('Failed to record prediction:', error);
    }
  }
  
  /**
   * Update local metrics with new prediction
   */
  private updateMetrics(result: PredictionResult): void {
    this.metrics.totalPredictions++;
    
    // Update rolling averages
    const alpha = 0.1; // Learning rate for moving averages
    this.metrics.averageConfidence = 
      this.metrics.averageConfidence * (1 - alpha) + result.confidence * alpha;
    this.metrics.averageProcessingTime = 
      this.metrics.averageProcessingTime * (1 - alpha) + result.processingTime * alpha;
    
    // Track gestural patterns
    const count = this.metrics.gesturalPatterns.get(result.label) || 0;
    this.metrics.gesturalPatterns.set(result.label, count + 1);
    
    // Track contextual factors
    if (result.context) {
      for (const [key, value] of Object.entries(result.context)) {
        const factor = `${key}_${value}`;
        this.metrics.contextualFactors[factor] = (this.metrics.contextualFactors[factor] || 0) + 1;
      }
    }
    
    this.metrics.lastUpdate = new Date();
  }
  
  /**
   * Get current performance metrics
   */
  getCurrentMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Get performance insights for UI display
   */
  getPerformanceInsights(): {
    overall: 'excellent' | 'good' | 'moderate' | 'poor';
    recommendations: string[];
    modelEfficiency: { global: number; profile: number };
  } {
    const confidence = this.metrics.averageConfidence;
    const speed = this.metrics.averageProcessingTime;
    
    // Overall performance rating
    let overall: 'excellent' | 'good' | 'moderate' | 'poor';
    if (confidence > 0.9 && speed < 50) overall = 'excellent';
    else if (confidence > 0.8 && speed < 100) overall = 'good';
    else if (confidence > 0.7 && speed < 200) overall = 'moderate';
    else overall = 'poor';
    
    // Generate recommendations
    const recommendations: string[] = [];
    
    if (confidence < 0.8) {
      recommendations.push('Consider retraining with more diverse samples');
    }
    
    if (speed > 150) {
      recommendations.push('Model is running slowly, consider optimization');
    }
    
    // Check for context-specific issues
    const poorLighting = this.metrics.contextualFactors['lighting_poor'] || 0;
    const totalPredictions = this.metrics.totalPredictions;
    if (poorLighting / totalPredictions > 0.3) {
      recommendations.push('Poor lighting conditions detected, improve lighting');
    }
    
    const noHands = this.metrics.contextualFactors['handVisibility_none'] || 0;
    if (noHands / totalPredictions > 0.2) {
      recommendations.push('Hands frequently not visible, adjust camera position');
    }
    
    // Model efficiency comparison
    const globalEfficiency = this.calculateModelEfficiency('global');
    const profileEfficiency = this.calculateModelEfficiency('profile');
    
    return {
      overall,
      recommendations,
      modelEfficiency: {
        global: globalEfficiency,
        profile: profileEfficiency
      }
    };
  }
  
  /**
   * Calculate efficiency for a specific model type
   */
  private calculateModelEfficiency(modelType: 'global' | 'profile'): number {
    const modelPredictions = this.recentPredictions.filter(p => p.modelType === modelType);
    if (modelPredictions.length === 0) return 0;
    
    const avgConfidence = modelPredictions.reduce((sum, p) => sum + p.confidence, 0) / modelPredictions.length;
    const avgSpeed = modelPredictions.reduce((sum, p) => sum + p.processingTime, 0) / modelPredictions.length;
    
    // Efficiency score: confidence weighted by speed
    return avgConfidence * (1 - Math.min(avgSpeed / 1000, 1));
  }
  
  /**
   * Send batch feedback to training pipeline
   */
  private async sendFeedbackBatch(): Promise<void> {
    try {
      if (this.recentPredictions.length === 0) return;
      
      const batch = this.recentPredictions.slice(-this.BATCH_SIZE);
      const currentModel = modelManager.getCurrentModelInfo();
      
      const feedbackData = {
        timestamp: Date.now(),
        modelInfo: currentModel,
        predictions: batch.map(p => ({
          label: p.label,
          confidence: p.confidence,
          processingTime: p.processingTime,
          context: p.context
        })),
        aggregateMetrics: {
          batchAccuracy: this.calculateBatchAccuracy(batch),
          averageConfidence: batch.reduce((sum, p) => sum + p.confidence, 0) / batch.length,
          averageProcessingTime: batch.reduce((sum, p) => sum + p.processingTime, 0) / batch.length,
          contextualDistribution: this.calculateContextualDistribution(batch)
        },
        systemInfo: {
          userAgent: navigator.userAgent,
          memory: (performance as any).memory ? {
            usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
            totalJSHeapSize: (performance as any).memory.totalJSHeapSize
          } : undefined
        }
      };
      
      await sendTelemetryEvent('performance_feedback_batch', feedbackData);
      console.log('📊 Performance feedback sent:', feedbackData.aggregateMetrics);
      
    } catch (error) {
      console.warn('Failed to send performance feedback:', error);
    }
  }
  
  /**
   * Calculate accuracy metrics for a batch
   */
  private calculateBatchAccuracy(batch: PredictionResult[]): number {
    // This would need ground truth data - for now use confidence as proxy
    return batch.reduce((sum, p) => sum + p.confidence, 0) / batch.length;
  }
  
  /**
   * Analyze contextual factors distribution
   */
  private calculateContextualDistribution(batch: PredictionResult[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    for (const prediction of batch) {
      if (!prediction.context) continue;
      
      for (const [key, value] of Object.entries(prediction.context)) {
        const contextKey = `${key}_${value}`;
        distribution[contextKey] = (distribution[contextKey] || 0) + 1;
      }
    }
    
    return distribution;
  }
  
  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = {
      totalPredictions: 0,
      accuracyScore: 0,
      averageConfidence: 0,
      averageProcessingTime: 0,
      modelSwitches: 0,
      errors: 0,
      lastUpdate: new Date(),
      gesturalPatterns: new Map(),
      contextualFactors: {}
    };
    this.recentPredictions = [];
    console.log('🔄 Performance feedback reset');
  }
  
  /**
   * Export metrics for analysis
   */
  exportMetrics(): string {
    return JSON.stringify({
      metrics: this.metrics,
      recentPredictions: this.recentPredictions,
      insights: this.getPerformanceInsights(),
      exportedAt: new Date().toISOString()
    }, null, 2);
  }
}

// Singleton instance
export const performanceFeedback = new PerformanceFeedback();

// Integration with installMlp prediction function
export function enhancePredictionWithFeedback(
  prediction: { label: string; score: number } | null,
  processingTime: number,
  context?: PredictionResult['context']
): void {
  if (!prediction) return;
  
  const currentModel = modelManager.getCurrentModelInfo();
  
  const result: PredictionResult = {
    ...prediction,
    timestamp: Date.now(),
    confidence: prediction.score,
    processingTime,
    modelType: currentModel.type,
    ...(currentModel.profileId ? { profileId: currentModel.profileId } : {}),
    ...(context ? { context } : {})
  };
  
  performanceFeedback.recordPrediction(result);
}

// Export utilities
// Export utilities - types already declared above
export default performanceFeedback;