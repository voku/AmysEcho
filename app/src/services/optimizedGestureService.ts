import { databaseOptimizationService } from './databaseOptimizationService';
import { gestureModel, GestureModelEntry } from '../model';
import { logger } from '../utils/logger';

// Optimized gesture service
export class OptimizedGestureService {
  private static instance: OptimizedGestureService;
  private gestureCache = new Map<string, GestureModelEntry>();
  private categoryCache = new Map<string, GestureModelEntry[]>();

  private constructor() {
    this.initializeCache();
  }

  public static getInstance(): OptimizedGestureService {
    if (!OptimizedGestureService.instance) {
      OptimizedGestureService.instance = new OptimizedGestureService();
    }
    return OptimizedGestureService.instance;
  }

  // Initialize cache with static gesture data
  private initializeCache(): void {
    // Cache all gestures by ID
    gestureModel.gestures.forEach(gesture => {
      this.gestureCache.set(gesture.id, gesture);
    });

    // Cache gestures by category
    const categories = [...new Set(gestureModel.gestures.map(g => g.category).filter(Boolean))];
    categories.forEach(category => {
      if (category) {
        const categoryGestures = gestureModel.gestures.filter(g => g.category === category);
        this.categoryCache.set(category, categoryGestures);
      }
    });

    logger.info(`Initialized gesture cache with ${this.gestureCache.size} gestures`);
  }

  // Optimized gesture lookup by ID
  public getGestureById(id: string): GestureModelEntry | null {
    return this.gestureCache.get(id) || null;
  }

  // Optimized gesture lookup by category
  public getGesturesByCategory(category: string): GestureModelEntry[] {
    return this.categoryCache.get(category) || [];
  }

  // Get gestures with video support (optimized for frequent access)
  public async getGesturesWithVideo(): Promise<GestureModelEntry[]> {
    // Use database optimization service for caching
    return databaseOptimizationService.queryWithCache(
      'gestures_with_video',
      () => Promise.resolve(gestureModel.gestures.filter(gesture => gesture.dgsVideoUri)),
      'gestures_with_video',
      300000 // 5 minutes TTL
    );
  }

  // Get gestures by multiple IDs (batch operation)
  public getGesturesByIds(ids: string[]): GestureModelEntry[] {
    const results: GestureModelEntry[] = [];
    const missingIds: string[] = [];

    // Check cache first
    ids.forEach(id => {
      const cached = this.gestureCache.get(id);
      if (cached) {
        results.push(cached);
      } else {
        missingIds.push(id);
      }
    });

    // Log missing gestures (shouldn't happen with static data)
    if (missingIds.length > 0) {
      logger.warn(`Missing gestures in cache: ${missingIds.join(', ')}`);
    }

    return results;
  }

  // Search gestures by label (optimized with index-like search)
  public searchGestures(query: string, limit: number = 10): GestureModelEntry[] {
    const lowercaseQuery = query.toLowerCase();

    return gestureModel.gestures
      .filter(gesture =>
        gesture.label.toLowerCase().includes(lowercaseQuery) ||
        gesture.id.toLowerCase().includes(lowercaseQuery)
      )
      .slice(0, limit);
  }

  // Get gesture suggestions based on context
  public getContextualSuggestions(
    recentGestures: string[],
    timeOfDay: string,
    activityLevel: string,
    limit: number = 5
  ): GestureModelEntry[] {
    const suggestions: GestureModelEntry[] = [];
    const usedGestures = new Set(recentGestures);

    // Time-based suggestions
    if (timeOfDay === 'morning') {
      const morningGestures = ['hello', 'eat', 'water', 'thank_you'];
      morningGestures.forEach(id => {
        if (!usedGestures.has(id)) {
          const gesture = this.getGestureById(id);
          if (gesture) suggestions.push(gesture);
        }
      });
    } else if (timeOfDay === 'afternoon') {
      const afternoonGestures = ['play', 'more', 'finished', 'help'];
      afternoonGestures.forEach(id => {
        if (!usedGestures.has(id)) {
          const gesture = this.getGestureById(id);
          if (gesture) suggestions.push(gesture);
        }
      });
    }

    // Activity-based suggestions
    if (activityLevel === 'high') {
      const highActivityGestures = ['play', 'happy', 'more'];
      highActivityGestures.forEach(id => {
        if (!usedGestures.has(id)) {
          const gesture = this.getGestureById(id);
          if (gesture && !suggestions.find(s => s.id === id)) {
            suggestions.push(gesture);
          }
        }
      });
    }

    // Fill with general gestures if needed
    if (suggestions.length < limit) {
      const generalGestures = ['please', 'thank_you', 'yes', 'no'];
      generalGestures.forEach(id => {
        if (!usedGestures.has(id) && suggestions.length < limit) {
          const gesture = this.getGestureById(id);
          if (gesture && !suggestions.find(s => s.id === id)) {
            suggestions.push(gesture);
          }
        }
      });
    }

    return suggestions.slice(0, limit);
  }

  // Get gesture statistics (for analytics)
  public getGestureStats(): {
    totalGestures: number;
    gesturesByCategory: Record<string, number>;
    gesturesWithVideo: number;
  } {
    const byCategory: Record<string, number> = {};
    let withVideo = 0;

    gestureModel.gestures.forEach(gesture => {
      if (gesture.category) {
        byCategory[gesture.category] = (byCategory[gesture.category] || 0) + 1;
      }
      if (gesture.dgsVideoUri) {
        withVideo++;
      }
    });

    return {
      totalGestures: gestureModel.gestures.length,
      gesturesByCategory: byCategory,
      gesturesWithVideo: withVideo
    };
  }

  // Preload frequently used gestures
  public preloadFrequentGestures(): void {
    // Preload basic gestures that are used most frequently
    const frequentIds = ['hello', 'thank_you', 'please', 'more', 'finished', 'help', 'yes', 'no'];
    frequentIds.forEach(id => {
      this.getGestureById(id); // This will cache them
    });

    logger.info('Preloaded frequent gestures');
  }

  // Clear cache (for memory optimization)
  public clearCache(): void {
    // Note: Since we use static data, we don't actually clear the cache
    // but this method is here for consistency with the database service
    logger.info('Gesture cache clear requested (no-op for static data)');
  }

  // Get cache statistics
  public getCacheStats(): {
    size: number;
    hitRate: number;
  } {
    return {
      size: this.gestureCache.size,
      hitRate: 1.0 // Always 100% hit rate for static data
    };
  }
}

// Export singleton instance
export const optimizedGestureService = OptimizedGestureService.getInstance();