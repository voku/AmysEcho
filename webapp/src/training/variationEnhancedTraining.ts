/**
 * Variation-Enhanced Training Service
 * 
 * Extends the training pipeline to include gesture variation data,
 * allowing the ML model to learn from Amy's natural signing variations.
 * 
 * Amy First: Her unique signing style becomes the model's foundation
 */

import { SignVariationTracker } from '../services/signVariationTracker';
import type { TrainingBundlePayload } from './types';

export interface VariationEnhancedMetadata {
  variationData?: {
    /**
     * The specific cluster ID this training sample belongs to (if clustered).
     * This represents a unique variation pattern discovered for this gesture.
     */
    clusterId?: string;
    /**
     * The ID of the dominant (most frequently used) cluster for this gesture.
     * This represents Amy's preferred way of performing the sign.
     */
    dominantCluster: string;
    variationDiversity: number;
    totalVariations: number;
    recommendTraining: boolean;
    canonicalTemplates: number; // How many variation templates exist
  };
}

/**
 * Enhance training bundle metadata with variation information
 */
export function enhanceWithVariationData(
  payload: TrainingBundlePayload,
  variationTracker: SignVariationTracker
): TrainingBundlePayload & VariationEnhancedMetadata {
  const gesture = payload.label;
  
  // Get variation metrics for this gesture
  const metrics = variationTracker.getLearningMetrics(gesture);
  const exported = variationTracker.exportForTraining(gesture);
  
  const enhanced: TrainingBundlePayload & VariationEnhancedMetadata = {
    ...payload,
    variationData: {
      dominantCluster: metrics.dominantCluster,
      variationDiversity: metrics.variationDiversity,
      totalVariations: metrics.totalVariations,
      recommendTraining: metrics.recommendTraining,
      canonicalTemplates: exported.canonicalTemplates.length,
    },
  };
  
  return enhanced;
}

/**
 * Get variation-based training recommendations
 * Returns gestures that would benefit most from additional training data
 */
export function getVariationTrainingRecommendations(
  variationTracker: SignVariationTracker,
  allGestures: string[]
): Array<{
  gesture: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  variationDiversity: number;
}> {
  const recommendations = [];
  
  for (const gesture of allGestures) {
    const metrics = variationTracker.getLearningMetrics(gesture);
    
    let priority: 'high' | 'medium' | 'low' = 'low';
    let reason = '';
    
    if (metrics.recommendTraining) {
      if (metrics.variationDiversity > 0.7) {
        priority = 'high';
        reason = 'Sehr unterschiedliche Ausführungen - mehr Übung würde helfen';
      } else if (metrics.variationDiversity > 0.5) {
        priority = 'medium';
        reason = 'Verschiedene Ausführungen - gelegentliches Üben empfohlen';
      } else {
        priority = 'low';
        reason = metrics.reason || 'Leichte Variation in der Ausführung';
      }
      
      recommendations.push({
        gesture,
        priority,
        reason,
        variationDiversity: metrics.variationDiversity,
      });
    }
  }
  
  // Sort by priority (high first) and then by diversity
  recommendations.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.variationDiversity - a.variationDiversity;
  });
  
  return recommendations;
}

/**
 * Prepare variation templates for augmented training
 * Returns additional training samples based on learned variations
 */
export function prepareVariationAugmentations(
  gesture: string,
  variationTracker: SignVariationTracker
): {
  templates: Array<{
    landmarks: number[][][];
    confidence: number;
    isCanonical: boolean;
  }>;
  metadata: {
    totalClusters: number;
    averageVariationCount: number;
  };
} {
  const exported = variationTracker.exportForTraining(gesture);
  
  const templates = exported.canonicalTemplates.map((template) => ({
    landmarks: template.handLandmarks,
    confidence: 1.0, // Canonical templates have high confidence
    isCanonical: true,
  }));
  
  const totalClusters = exported.clusters.length;
  const averageVariationCount = totalClusters > 0
    ? exported.clusters.reduce((sum, c) => sum + c.variations.length, 0) / totalClusters
    : 0;
  
  return {
    templates,
    metadata: {
      totalClusters,
      averageVariationCount,
    },
  };
}

/**
 * Generate training insights for caregiver dashboard
 * Provides actionable feedback about Amy's gesture learning progress
 */
export function generateTrainingInsights(
  variationTracker: SignVariationTracker,
  recentGestures: string[]
): {
  summary: string;
  recommendations: string[];
  strengths: string[];
  needsPractice: string[];
} {
  const allMetrics = recentGestures.map((g) => ({
    gesture: g,
    ...variationTracker.getLearningMetrics(g),
  }));
  
  const highDiversity = allMetrics.filter((m) => m.variationDiversity > 0.6);
  const consistent = allMetrics.filter((m) => m.variationDiversity < 0.3 && m.totalVariations > 5);
  
  const summary = highDiversity.length > recentGestures.length / 2
    ? 'Amy zeigt viele verschiedene Ausführungen ihrer Gesten. Das ist normal beim Lernen!'
    : 'Amy wird immer konsistenter bei ihren Gesten. Tolles Training!';
  
  const recommendations: string[] = [];
  if (highDiversity.length > 0) {
    recommendations.push(
      `Üben Sie diese Gesten öfter: ${highDiversity.slice(0, 3).map(m => m.gesture).join(', ')}`
    );
  }
  
  const needsTraining = allMetrics.filter((m) => m.recommendTraining);
  if (needsTraining.length > 0) {
    recommendations.push(
      `${needsTraining.length} Gesten würden von zusätzlichem Training profitieren`
    );
  }
  
  const strengths = consistent.map((m) => m.gesture);
  const needsPractice = highDiversity.map((m) => m.gesture);
  
  return {
    summary,
    recommendations,
    strengths,
    needsPractice,
  };
}
