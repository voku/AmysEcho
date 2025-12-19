/**
 * Sign Variation Tracker - Amy First
 * 
 * Learns and adapts to Amy's natural signing variations instead of forcing
 * a single "correct" way to perform each sign. This service:
 * 
 * 1. Captures different ways Amy performs the same sign
 * 2. Clusters similar variations together
 * 3. Creates confidence-weighted canonical templates
 * 4. Helps the trainer learn from all variations
 * 
 * Amy Impact: Zero judgment - celebrate all signing attempts, learn from each one
 */

import { getCurrentTimestamp, getTimestampId, isWithinTimeWindow } from '../utils/timeUtils';
import { sortByTimestampDesc } from '../utils/arrayUtils';

export interface GestureLandmarks {
  handLandmarks: number[][][]; // [hand][landmark][x,y,z]
  poseLandmarks?: number[][]; // [landmark][x,y,z,visibility]
  faceLandmarks?: number[][]; // [landmark][x,y,z]
  handedness?: ('Left' | 'Right' | 'Both')[];
}

export interface SignVariation {
  id: string;
  gesture: string;
  landmarks: GestureLandmarks;
  confidence: number;
  timestamp: number;
  successfulMatch: boolean;
  profileId: string;
  /** Cluster ID for grouping similar variations */
  clusterId?: string;
}

export interface VariationCluster {
  id: string;
  gesture: string;
  variations: SignVariation[];
  /** Weighted average of all variations in this cluster */
  canonicalTemplate: GestureLandmarks;
  /** How many times this variation cluster was successfully recognized */
  successCount: number;
  /** Total attempts for this variation cluster */
  totalAttempts: number;
  /** Success rate for this specific variation */
  successRate: number;
  /** Last time this variation was used */
  lastUsed: number;
}

export interface VariationLearningMetrics {
  gesture: string;
  totalVariations: number;
  activeClusters: number;
  dominantCluster: string;
  variationDiversity: number; // 0-1, higher means more varied signing
  recommendTraining: boolean;
  reason: string | undefined;
}

export class SignVariationTracker {
  private variations: Map<string, SignVariation[]> = new Map();
  private clusters: Map<string, VariationCluster[]> = new Map();
  
  private readonly MAX_VARIATIONS_PER_GESTURE = 100;
  private readonly VARIATION_SIMILARITY_THRESHOLD = 0.85; // 85% similarity to cluster together
  private readonly MIN_CLUSTER_SIZE = 3; // Need at least 3 samples to form a cluster
  private readonly CLUSTER_STABILITY_DAYS = 7; // Keep clusters for 7 days
  
  /**
   * Record a new gesture variation
   */
  recordVariation(
    gesture: string,
    landmarks: GestureLandmarks,
    confidence: number,
    successfulMatch: boolean,
    profileId: string
  ): SignVariation {
    const variation: SignVariation = {
      id: this.generateVariationId(),
      gesture,
      landmarks,
      confidence,
      timestamp: getCurrentTimestamp(),
      successfulMatch,
      profileId,
    };
    
    // Store variation
    const existing = this.variations.get(gesture) || [];
    existing.push(variation);
    
    // Limit storage
    if (existing.length > this.MAX_VARIATIONS_PER_GESTURE) {
      existing.shift(); // Remove oldest
    }
    
    this.variations.set(gesture, existing);
    
    // Try to cluster this variation
    this.updateClusters(gesture, variation);
    
    return variation;
  }
  
  /**
   * Get all variation clusters for a gesture
   */
  getVariationClusters(gesture: string): VariationCluster[] {
    return this.clusters.get(gesture) || [];
  }
  
  /**
   * Get the dominant (most frequently used) variation cluster
   */
  getDominantCluster(gesture: string): VariationCluster | null {
    const clusters = this.getVariationClusters(gesture);
    if (clusters.length === 0) return null;
    
    // Sort by success rate and recency to favor quality over quantity
    // This allows Amy's style to evolve and improve over time
    const now = getCurrentTimestamp();
    const sorted = clusters.sort((a, b) => {
      const scoreA = a.successRate * 0.7 + (a.lastUsed / now) * 0.3;
      const scoreB = b.successRate * 0.7 + (b.lastUsed / now) * 0.3;
      return scoreB - scoreA;
    });
    
    return sorted[0] ?? null;
  }
  
  /**
   * Get learning metrics to understand variation patterns
   */
  getLearningMetrics(gesture: string): VariationLearningMetrics {
    const variations = this.variations.get(gesture) || [];
    const clusters = this.getVariationClusters(gesture);
    const dominant = this.getDominantCluster(gesture);
    
    const diversity = this.calculateVariationDiversity(gesture);
    
    // Recommend training if there's high diversity but low success rates
    const recommendTraining = diversity > 0.6 && clusters.some(c => c.successRate < 0.7);
    
    return {
      gesture,
      totalVariations: variations.length,
      activeClusters: clusters.length,
      dominantCluster: dominant?.id || 'none',
      variationDiversity: diversity,
      recommendTraining,
      reason: recommendTraining 
        ? 'Viele verschiedene Ausführungen - Training könnte helfen' 
        : undefined,
    };
  }
  
  /**
   * Export variation data for training
   * Returns clusters that can be used to augment training data
   */
  exportForTraining(gesture: string): {
    clusters: VariationCluster[];
    canonicalTemplates: GestureLandmarks[];
  } {
    const clusters = this.getVariationClusters(gesture);
    const canonicalTemplates = clusters
      .filter(c => c.successRate > 0.5) // Only include successful variations
      .map(c => c.canonicalTemplate);
    
    return { clusters, canonicalTemplates };
  }
  
  /**
   * Clear old variations to keep memory manageable
   */
  cleanup(): void {
    const now = getCurrentTimestamp();
    const retentionMs = this.CLUSTER_STABILITY_DAYS * 24 * 60 * 60 * 1000;
    
    for (const [gesture, variations] of this.variations.entries()) {
      const recent = variations.filter(v => isWithinTimeWindow(v.timestamp, retentionMs, now));
      if (recent.length === 0) {
        this.variations.delete(gesture);
      } else {
        this.variations.set(gesture, recent);
      }
    }
    
    // Also clean up clusters
    for (const [gesture, clusters] of this.clusters.entries()) {
      const recent = clusters.filter(c => now - c.lastUsed < retentionMs);
      if (recent.length === 0) {
        this.clusters.delete(gesture);
      } else {
        this.clusters.set(gesture, recent);
      }
    }
  }
  
  /**
   * Export all data for persistence
   */
  exportData(): {
    variations: Record<string, SignVariation[]>;
    clusters: Record<string, VariationCluster[]>;
  } {
    const variations: Record<string, SignVariation[]> = {};
    for (const [gesture, vars] of this.variations) {
      variations[gesture] = vars;
    }
    
    const clusters: Record<string, VariationCluster[]> = {};
    for (const [gesture, clusts] of this.clusters) {
      clusters[gesture] = clusts;
    }
    
    return { variations, clusters };
  }
  
  /**
   * Import data from persistence
   */
  importData(data: {
    variations?: Record<string, SignVariation[]>;
    clusters?: Record<string, VariationCluster[]>;
  }): void {
    if (data.variations) {
      this.variations.clear();
      for (const [gesture, vars] of Object.entries(data.variations)) {
        this.variations.set(gesture, vars);
      }
    }
    
    if (data.clusters) {
      this.clusters.clear();
      for (const [gesture, clusts] of Object.entries(data.clusters)) {
        this.clusters.set(gesture, clusts);
      }
    }
  }
  
  // Private helper methods
  
  /**
   * Validate that a landmark point has all required coordinates
   */
  private isValidLandmarkPoint(point: number[] | undefined): boolean {
    return Boolean(
      point && 
      point.length >= 3 && 
      point[0] !== undefined && 
      point[1] !== undefined && 
      point[2] !== undefined
    );
  }
  
  private generateVariationId(): string {
    return `var_${getTimestampId()}_${Math.random().toString(36).substring(2, 11)}`;
  }
  
  private updateClusters(gesture: string, variation: SignVariation): void {
    const existingClusters = this.clusters.get(gesture) || [];
    
    // Try to find a matching cluster
    let matchedCluster: VariationCluster | null = null;
    let maxSimilarity = 0;
    
    for (const cluster of existingClusters) {
      const similarity = this.calculateSimilarity(
        variation.landmarks,
        cluster.canonicalTemplate
      );
      
      if (similarity > maxSimilarity && similarity >= this.VARIATION_SIMILARITY_THRESHOLD) {
        maxSimilarity = similarity;
        matchedCluster = cluster;
      }
    }
    
    if (matchedCluster) {
      // Add to existing cluster
      matchedCluster.variations.push(variation);
      matchedCluster.totalAttempts++;
      if (variation.successfulMatch) {
        matchedCluster.successCount++;
      }
      matchedCluster.successRate = matchedCluster.successCount / matchedCluster.totalAttempts;
      matchedCluster.lastUsed = variation.timestamp;
      
      // Update canonical template with weighted average
      matchedCluster.canonicalTemplate = this.calculateCanonicalTemplate(
        matchedCluster.variations
      );
      
      variation.clusterId = matchedCluster.id;
    } else if (this.shouldCreateNewCluster(gesture, variation)) {
      // Create new cluster
      const newCluster: VariationCluster = {
        id: `cluster_${getTimestampId()}_${Math.random().toString(36).substring(2, 11)}`,
        gesture,
        variations: [variation],
        canonicalTemplate: variation.landmarks,
        successCount: variation.successfulMatch ? 1 : 0,
        totalAttempts: 1,
        successRate: variation.successfulMatch ? 1.0 : 0.0,
        lastUsed: variation.timestamp,
      };
      
      existingClusters.push(newCluster);
      variation.clusterId = newCluster.id;
    }
    
    this.clusters.set(gesture, existingClusters);
  }
  
  private shouldCreateNewCluster(gesture: string, variation: SignVariation): boolean {
    const variations = this.variations.get(gesture) || [];
    
    // Need enough samples before creating clusters
    if (variations.length < this.MIN_CLUSTER_SIZE) {
      return false;
    }
    
    // Only create clusters for successful matches
    return variation.successfulMatch;
  }
  
  private calculateSimilarity(
    landmarks1: GestureLandmarks,
    landmarks2: GestureLandmarks
  ): number {
    // Enhanced hand landmark similarity with handedness awareness
    const hands1 = landmarks1.handLandmarks;
    const hands2 = landmarks2.handLandmarks;
    
    if (!hands1 || !hands2 || hands1.length === 0 || hands2.length === 0) {
      return 0;
    }
    
    // Use handedness information to match corresponding hands correctly
    const handedness1 = landmarks1.handedness || [];
    const handedness2 = landmarks2.handedness || [];
    
    // For two-handed signs, compare both hands with correct matching
    if (hands1.length > 1 && hands2.length > 1 && handedness1.length > 0 && handedness2.length > 0) {
      // Try to match hands by handedness
      let totalSimilarity = 0;
      let matchCount = 0;
      
      for (let i = 0; i < hands1.length; i++) {
        const hand1 = hands1[i];
        const handType1 = handedness1[i];
        
        // Find matching hand in landmarks2
        for (let j = 0; j < hands2.length; j++) {
          const hand2 = hands2[j];
          const handType2 = handedness2[j];
          
          // Match hands by handedness (Left with Left, Right with Right)
          if (handType1 === handType2 && hand1 && hand2 && hand1.length === hand2.length) {
            const similarity = this.compareHandLandmarks(hand1, hand2);
            totalSimilarity += similarity;
            matchCount++;
            break; // Found match for this hand
          }
        }
      }
      
      return matchCount > 0 ? totalSimilarity / matchCount : 0;
    }
    
    // Fallback: If handedness info not available or single hand, compare all possible pairings
    // and take the maximum similarity (best match)
    let maxSimilarity = 0;
    
    for (const hand1 of hands1) {
      if (!hand1) continue;
      
      for (const hand2 of hands2) {
        if (!hand2 || hand1.length !== hand2.length) continue;
        
        const similarity = this.compareHandLandmarks(hand1, hand2);
        maxSimilarity = Math.max(maxSimilarity, similarity);
      }
    }
    
    return maxSimilarity;
  }
  
  /**
   * Compare two hand landmark arrays and return similarity score
   */
  private compareHandLandmarks(hand1: number[][], hand2: number[][]): number {
    // Calculate average Euclidean distance between landmarks
    let totalDistance = 0;
    let count = 0;
    
    for (let i = 0; i < hand1.length; i++) {
      const p1 = hand1[i];
      const p2 = hand2[i];
      
      // Validate points before accessing coordinates
      if (this.isValidLandmarkPoint(p1) && this.isValidLandmarkPoint(p2)) {
        const dx = p1![0]! - p2![0]!;
        const dy = p1![1]! - p2![1]!;
        const dz = p1![2]! - p2![2]!;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        totalDistance += dist;
        count++;
      }
    }
    
    if (count === 0) return 0;
    
    const avgDistance = totalDistance / count;
    
    // Convert distance to similarity (1.0 = identical, 0.0 = very different)
    // Assuming landmarks are normalized to [0,1], max distance is ~sqrt(3)
    const maxDistance = Math.sqrt(3);
    const similarity = Math.max(0, 1 - (avgDistance / maxDistance));
    
    return similarity;
  }
  
  private calculateCanonicalTemplate(variations: SignVariation[]): GestureLandmarks {
    if (variations.length === 0) {
      return { handLandmarks: [] };
    }
    
    // Weight successful variations more heavily
    const successfulVariations = variations.filter(v => v.successfulMatch);
    
    if (successfulVariations.length === 0) {
      // Fall back to highest confidence variation if no successful ones
      const sorted = [...variations].sort((a, b) => b.confidence - a.confidence);
      return sorted[0]?.landmarks ?? { handLandmarks: [] };
    }
    
    // Use weighted average based on confidence for successful variations
    const totalWeight = successfulVariations.reduce((sum, v) => sum + v.confidence, 0);
    
    if (totalWeight === 0) {
      return successfulVariations[0]?.landmarks ?? { handLandmarks: [] };
    }
    
    // Implement weighted averaging of landmark positions for more robust templates
    return this.computeWeightedAverageLandmarks(successfulVariations, totalWeight);
  }
  
  /**
   * Compute weighted average of hand landmarks from multiple variations
   * Each variation is weighted by its confidence score
   */
  private computeWeightedAverageLandmarks(
    variations: SignVariation[],
    totalWeight: number
  ): GestureLandmarks {
    if (variations.length === 0 || totalWeight === 0) {
      return { handLandmarks: [] };
    }
    
    // Initialize result structure
    const result: GestureLandmarks = {
      handLandmarks: [],
    };
    
    // Find the maximum number of hands across all variations
    const maxHands = Math.max(
      ...variations.map(v => v.landmarks.handLandmarks.length),
      0
    );
    
    // Average each hand separately
    for (let handIdx = 0; handIdx < maxHands; handIdx++) {
      // Find maximum number of landmarks for this hand across variations
      const maxLandmarks = Math.max(
        ...variations
          .filter(v => v.landmarks.handLandmarks[handIdx])
          .map(v => v.landmarks.handLandmarks[handIdx]!.length),
        0
      );
      
      const handLandmarks: number[][] = [];
      
      // Average each landmark position
      for (let lmIdx = 0; lmIdx < maxLandmarks; lmIdx++) {
        let sumX = 0;
        let sumY = 0;
        let sumZ = 0;
        let weight = 0;
        
        for (const variation of variations) {
          const hand = variation.landmarks.handLandmarks[handIdx];
          const landmark = hand?.[lmIdx];
          
          if (landmark && this.isValidLandmarkPoint(landmark)) {
            const w = variation.confidence;
            sumX += landmark[0]! * w;
            sumY += landmark[1]! * w;
            sumZ += landmark[2]! * w;
            weight += w;
          }
        }
        
        if (weight > 0) {
          handLandmarks.push([sumX / weight, sumY / weight, sumZ / weight]);
        } else {
          // Fallback to first valid landmark if no weighted average possible
          const firstValid = variations.find(
            v => v.landmarks.handLandmarks[handIdx]?.[lmIdx]
          );
          if (firstValid?.landmarks.handLandmarks[handIdx]?.[lmIdx]) {
            handLandmarks.push([...firstValid.landmarks.handLandmarks[handIdx]![lmIdx]!]);
          }
        }
      }
      
      result.handLandmarks.push(handLandmarks);
    }
    
    // Also average pose and face landmarks if present
    const hasPose = variations.some(v => v.landmarks.poseLandmarks);
    const hasFace = variations.some(v => v.landmarks.faceLandmarks);
    
    if (hasPose) {
      const averaged = this.averageOptionalLandmarks(
        variations,
        v => v.landmarks.poseLandmarks
      );
      if (averaged) {
        result.poseLandmarks = averaged;
      }
    }
    
    if (hasFace) {
      const averaged = this.averageOptionalLandmarks(
        variations,
        v => v.landmarks.faceLandmarks
      );
      if (averaged) {
        result.faceLandmarks = averaged;
      }
    }
    
    return result;
  }
  
  /**
   * Average optional landmarks (pose or face) across variations
   */
  private averageOptionalLandmarks(
    variations: SignVariation[],
    getLandmarks: (v: SignVariation) => number[][] | undefined
  ): number[][] | undefined {
    const validVariations = variations.filter(v => getLandmarks(v));
    
    if (validVariations.length === 0) {
      return undefined;
    }
    
    const maxLandmarks = Math.max(
      ...validVariations.map(v => getLandmarks(v)?.length ?? 0),
      0
    );
    
    const result: number[][] = [];
    
    for (let lmIdx = 0; lmIdx < maxLandmarks; lmIdx++) {
      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;
      let weight = 0;
      
      for (const variation of validVariations) {
        const landmarks = getLandmarks(variation);
        const landmark = landmarks?.[lmIdx];
        
        if (landmark && this.isValidLandmarkPoint(landmark)) {
          const w = variation.confidence;
          sumX += landmark[0]! * w;
          sumY += landmark[1]! * w;
          sumZ += landmark[2]! * w;
          weight += w;
        }
      }
      
      if (weight > 0) {
        result.push([sumX / weight, sumY / weight, sumZ / weight]);
      }
    }
    
    return result.length > 0 ? result : undefined;
  }
  
  private calculateVariationDiversity(gesture: string): number {
    const clusters = this.getVariationClusters(gesture);
    
    if (clusters.length <= 1) return 0;
    
    // Diversity based on number of clusters and their size distribution
    const totalVariations = clusters.reduce((sum, c) => sum + c.variations.length, 0);
    
    if (totalVariations === 0) return 0;
    
    // Shannon entropy-like diversity measure
    let diversity = 0;
    for (const cluster of clusters) {
      const proportion = cluster.variations.length / totalVariations;
      if (proportion > 0) {
        diversity -= proportion * Math.log2(proportion);
      }
    }
    
    // Normalize to 0-1 range (log2(N) is max entropy for N clusters)
    const maxEntropy = Math.log2(clusters.length);
    if (maxEntropy > 0) {
      diversity /= maxEntropy;
    }
    
    return Math.min(1, diversity);
  }
}
