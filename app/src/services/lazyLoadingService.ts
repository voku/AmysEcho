import { logger } from '../utils/logger';

// Lazy loading service for UI components
export class LazyLoadingService {
  private static instance: LazyLoadingService;
  private loadedComponents = new Map<string, any>();
  private loadingPromises = new Map<string, Promise<any>>();
  private componentUsage = new Map<string, number>();

  private constructor() {
    this.initializePreloadedComponents();
  }

  public static getInstance(): LazyLoadingService {
    if (!LazyLoadingService.instance) {
      LazyLoadingService.instance = new LazyLoadingService();
    }
    return LazyLoadingService.instance;
  }

  // Initialize components that should be preloaded
  private initializePreloadedComponents(): void {
    // Preload critical components that are used immediately
    this.preloadComponent('BottomNav');
    this.preloadComponent('VisualFeedback');
    this.preloadComponent('Celebration');
  }

  // Preload a component in the background
  public preloadComponent(componentName: string): void {
    if (this.loadedComponents.has(componentName) || this.loadingPromises.has(componentName)) {
      return; // Already loaded or loading
    }

    const loadPromise = this.loadComponent(componentName);
    this.loadingPromises.set(componentName, loadPromise);

    loadPromise
      .then(component => {
        this.loadedComponents.set(componentName, component);
        this.loadingPromises.delete(componentName);
        logger.debug(`Preloaded component: ${componentName}`);
      })
      .catch(error => {
        logger.warn(`Failed to preload component ${componentName}:`, error);
        this.loadingPromises.delete(componentName);
      });
  }

  // Load a component dynamically
  private async loadComponent(componentName: string): Promise<any> {
    try {
      switch (componentName) {
        case 'BottomNav':
          return (await import('../components/BottomNav')).default;
        case 'VisualFeedback':
        case 'VisualRipple':
          return (await import('../components/VisualRipple')).default;
        case 'Celebration':
          return (await import('../components/Celebration')).default;
        case 'CorrectionPanel':
          return (await import('../components/CorrectionPanel')).default;
        case 'PracticeSuggestion':
          return (await import('../components/PracticeSuggestion')).default;
        case 'AdaptiveLearningPanel':
          return (await import('../components/AdaptiveLearningPanel')).default;
        case 'ScreenFlash':
          return (await import('../components/ScreenFlash')).default;
        case 'GestureMeaningDisplay':
          return (await import('../components/GestureMeaningDisplay')).default;
        case 'DgsVideoPlayer':
          return (await import('../components/DgsVideoPlayer')).default;
        default:
          throw new Error(`Unknown component: ${componentName}`);
      }
    } catch (error) {
      logger.error(`Failed to load component ${componentName}:`, error);
      throw error;
    }
  }

  // Get a component (load if not already loaded)
  public async getComponent(componentName: string): Promise<any> {
    // Track usage for analytics
    this.componentUsage.set(componentName, (this.componentUsage.get(componentName) || 0) + 1);

    // Check if already loaded
    if (this.loadedComponents.has(componentName)) {
      return this.loadedComponents.get(componentName);
    }

    // Check if currently loading
    if (this.loadingPromises.has(componentName)) {
      return await this.loadingPromises.get(componentName);
    }

    // Load the component
    return await this.loadComponent(componentName);
  }

  // Get a component synchronously if preloaded, otherwise return null
  public getComponentSync(componentName: string): any | null {
    return this.loadedComponents.get(componentName) || null;
  }

  // Check if a component is loaded
  public isComponentLoaded(componentName: string): boolean {
    return this.loadedComponents.has(componentName);
  }

  // Check if a component is currently loading
  public isComponentLoading(componentName: string): boolean {
    return this.loadingPromises.has(componentName);
  }

  // Preload components based on user behavior patterns
  public preloadBasedOnContext(context: {
    timeOfDay: string;
    recentScreens: string[];
    userActivity: string;
  }): void {
    const componentsToPreload: string[] = [];

    // Time-based preloading
    if (context.timeOfDay === 'morning') {
      componentsToPreload.push('PracticeSuggestion', 'AdaptiveLearningPanel');
    } else if (context.timeOfDay === 'afternoon') {
      componentsToPreload.push('DgsVideoPlayer');
    }

    // Activity-based preloading
    if (context.userActivity === 'learning') {
      componentsToPreload.push('GestureMeaningDisplay');
    }

    // Preload the components
    componentsToPreload.forEach(component => {
      this.preloadComponent(component);
    });

    if (componentsToPreload.length > 0) {
      logger.info(`Preloading ${componentsToPreload.length} components based on context`);
    }
  }

  // Get loading statistics
  public getLoadingStats(): {
    loadedComponents: number;
    loadingComponents: number;
    totalUsage: number;
    mostUsedComponents: Array<{ name: string; usage: number }>;
  } {
    const mostUsed = Array.from(this.componentUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, usage]) => ({ name, usage }));

    return {
      loadedComponents: this.loadedComponents.size,
      loadingComponents: this.loadingPromises.size,
      totalUsage: Array.from(this.componentUsage.values()).reduce((sum, usage) => sum + usage, 0),
      mostUsedComponents: mostUsed
    };
  }

  // Clear unused components to free memory
  public clearUnusedComponents(): void {
    // This is a simplified implementation
    // In a real scenario, you'd track when components were last used
    const componentsToClear: string[] = [];

    this.loadedComponents.forEach((_, componentName) => {
      // Clear components that haven't been used recently
      // For now, we'll just log this - actual implementation would need usage timestamps
      if (!this.isFrequentlyUsed(componentName)) {
        componentsToClear.push(componentName);
      }
    });

    componentsToClear.forEach(componentName => {
      this.loadedComponents.delete(componentName);
    });

    if (componentsToClear.length > 0) {
      logger.info(`Cleared ${componentsToClear.length} unused components`);
    }
  }

  // Check if a component is frequently used
  private isFrequentlyUsed(componentName: string): boolean {
    const usage = this.componentUsage.get(componentName) || 0;
    const totalUsage = Array.from(this.componentUsage.values()).reduce((sum, usage) => sum + usage, 0);

    // Consider frequently used if usage is above average
    const averageUsage = totalUsage / this.componentUsage.size;
    return usage > averageUsage;
  }

  // Reset usage statistics
  public resetUsageStats(): void {
    this.componentUsage.clear();
    logger.info('Reset component usage statistics');
  }

  // Cleanup
  public cleanup(): void {
    this.loadedComponents.clear();
    this.loadingPromises.clear();
    this.componentUsage.clear();
    logger.info('Lazy loading service cleaned up');
  }
}

// Export singleton instance
export const lazyLoadingService = LazyLoadingService.getInstance();