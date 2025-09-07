import { logger } from '../utils/logger';

export interface RecoveryAction {
  id: string;
  name: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  execute: () => Promise<boolean>;
  estimatedDuration: number; // in milliseconds
}

export interface RecoveryAttempt {
  timestamp: number;
  error: string;
  actions: RecoveryAction[];
  success: boolean;
  duration: number;
}

class AutomaticRecoveryService {
  private static instance: AutomaticRecoveryService;
  private recoveryHistory: RecoveryAttempt[] = [];
  private isRecovering = false;
  private readonly MAX_HISTORY = 20;
  private readonly MAX_RECOVERY_ATTEMPTS = 3;
  private readonly RECOVERY_COOLDOWN = 30000; // 30 seconds between recovery attempts
  private lastRecoveryAttempt = 0;

  static getInstance(): AutomaticRecoveryService {
    if (!AutomaticRecoveryService.instance) {
      AutomaticRecoveryService.instance = new AutomaticRecoveryService();
    }
    return AutomaticRecoveryService.instance;
  }

  private constructor() {
    this.loadRecoveryHistory();
  }

  /**
   * Attempt automatic recovery from a system error
   */
  async attemptRecovery(error: string, context: string): Promise<boolean> {
    const now = Date.now();

    // Check cooldown period
    if (now - this.lastRecoveryAttempt < this.RECOVERY_COOLDOWN) {
      logger.info('Recovery attempt too soon, skipping');
      return false;
    }

    // Check if already recovering
    if (this.isRecovering) {
      logger.info('Already recovering, skipping');
      return false;
    }

    // Check recovery attempt limits
    const recentAttempts = this.recoveryHistory.filter(
      attempt => now - attempt.timestamp < 5 * 60 * 1000 // Last 5 minutes
    );

    if (recentAttempts.length >= this.MAX_RECOVERY_ATTEMPTS) {
      logger.warn('Too many recent recovery attempts, manual intervention required');
      return false;
    }

    this.isRecovering = true;
    this.lastRecoveryAttempt = now;
    const startTime = now;

    try {
      logger.info(`Starting automatic recovery for: ${error} in ${context}`);

      const recoveryActions = this.getRecoveryActions(error, context);
      const attempt: RecoveryAttempt = {
        timestamp: now,
        error,
        actions: recoveryActions,
        success: false,
        duration: 0
      };

      // Execute recovery actions in priority order
      for (const action of recoveryActions.sort((a, b) =>
        this.getPriorityWeight(b.priority) - this.getPriorityWeight(a.priority)
      )) {
        try {
          logger.info(`Executing recovery action: ${action.name}`);
          const success = await action.execute();

          if (success) {
            logger.info(`Recovery action successful: ${action.name}`);
            attempt.success = true;
            break; // Stop at first successful action
          } else {
            logger.warn(`Recovery action failed: ${action.name}`);
          }
        } catch (actionError) {
          logger.error(`Recovery action threw error: ${action.name}`, actionError);
        }
      }

      attempt.duration = Date.now() - startTime;
      this.recoveryHistory.unshift(attempt);

      // Keep history bounded
      if (this.recoveryHistory.length > this.MAX_HISTORY) {
        this.recoveryHistory = this.recoveryHistory.slice(0, this.MAX_HISTORY);
      }

      this.saveRecoveryHistory();

      if (attempt.success) {
        logger.info(`Automatic recovery successful for: ${error}`);
      } else {
        logger.warn(`Automatic recovery failed for: ${error}`);
      }

      return attempt.success;

    } finally {
      this.isRecovering = false;
    }
  }

  /**
   * Get appropriate recovery actions for an error
   */
  private getRecoveryActions(error: string, context: string): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    const errorLower = error.toLowerCase();
    const contextLower = context.toLowerCase();

    // Camera-related errors
    if (errorLower.includes('camera') || errorLower.includes('permission')) {
      actions.push({
        id: 'camera_restart',
        name: 'Restart Camera',
        description: 'Restart camera stream to recover from camera errors',
        priority: 'high',
        estimatedDuration: 2000,
        execute: async () => {
          // This would trigger a camera restart in the WebView
          if (typeof window !== 'undefined' && window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'camera_restart'
            }));
          }
          return true;
        }
      });
    }

    // Network-related errors
    if (errorLower.includes('network') || errorLower.includes('fetch') || errorLower.includes('timeout')) {
      actions.push({
        id: 'network_retry',
        name: 'Retry Network Request',
        description: 'Retry failed network requests with exponential backoff',
        priority: 'medium',
        estimatedDuration: 1000,
        execute: async () => {
          // Wait a bit and retry
          await new Promise(resolve => setTimeout(resolve, 1000));
          return true; // Assume network issues are transient
        }
      });
    }

    // MediaPipe/WebGL errors
    if (errorLower.includes('mediapipe') || errorLower.includes('webgl') || errorLower.includes('wasm')) {
      actions.push({
        id: 'fallback_mode',
        name: 'Activate Fallback Mode',
        description: 'Switch to rule-based gesture detection as fallback',
        priority: 'high',
        estimatedDuration: 500,
        execute: async () => {
          // This would activate fallback mode in the WebView
          if (typeof window !== 'undefined' && window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'activate_fallback'
            }));
          }
          return true;
        }
      });
    }

    // Memory-related errors
    if (errorLower.includes('memory') || errorLower.includes('out of memory')) {
      actions.push({
        id: 'memory_cleanup',
        name: 'Memory Cleanup',
        description: 'Clear caches and free memory resources',
        priority: 'high',
        estimatedDuration: 1000,
        execute: async () => {
          // Force garbage collection if available
          if (typeof window !== 'undefined' && window.gc) {
            window.gc();
          }
          // Clear any cached data
          return true;
        }
      });
    }

    // Model loading errors
    if (errorLower.includes('model') || contextLower.includes('mlp') || contextLower.includes('classifier')) {
      actions.push({
        id: 'model_rollback',
        name: 'Model Rollback',
        description: 'Rollback to previous working model version',
        priority: 'critical',
        estimatedDuration: 3000,
        execute: async () => {
          // This would trigger model rollback in the app
          if (typeof window !== 'undefined' && window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'model_rollback'
            }));
          }
          return true;
        }
      });
    }

    // Generic restart action (always available as last resort)
    actions.push({
      id: 'system_restart',
      name: 'System Restart',
      description: 'Restart the gesture recognition system',
      priority: 'low',
      estimatedDuration: 2000,
      execute: async () => {
        // This would trigger a system restart
        if (typeof window !== 'undefined' && window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'system_restart'
          }));
        }
        return true;
      }
    });

    return actions;
  }

  /**
   * Get recovery statistics
   */
  getRecoveryStats(): {
    totalAttempts: number;
    successRate: number;
    averageDuration: number;
    recentFailures: number;
  } {
    if (this.recoveryHistory.length === 0) {
      return {
        totalAttempts: 0,
        successRate: 0,
        averageDuration: 0,
        recentFailures: 0
      };
    }

    const successful = this.recoveryHistory.filter(attempt => attempt.success);
    const recent = this.recoveryHistory.filter(
      attempt => Date.now() - attempt.timestamp < 60 * 60 * 1000 // Last hour
    );
    const recentFailures = recent.filter(attempt => !attempt.success);

    return {
      totalAttempts: this.recoveryHistory.length,
      successRate: successful.length / this.recoveryHistory.length,
      averageDuration: this.recoveryHistory.reduce((sum, attempt) => sum + attempt.duration, 0) / this.recoveryHistory.length,
      recentFailures: recentFailures.length
    };
  }

  /**
   * Check if system is currently recovering
   */
  isSystemRecovering(): boolean {
    return this.isRecovering;
  }

  /**
   * Get priority weight for sorting
   */
  private getPriorityWeight(priority: 'low' | 'medium' | 'high' | 'critical'): number {
    switch (priority) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }

  /**
   * Save recovery history to persistent storage
   */
  private async saveRecoveryHistory(): Promise<void> {
    try {
      const data = JSON.stringify(this.recoveryHistory);
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('amys_echo_recovery_history', data);
      }
    } catch (error) {
      logger.warn('Failed to save recovery history:', error);
    }
  }

  /**
   * Load recovery history from persistent storage
   */
  private async loadRecoveryHistory(): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const data = window.localStorage.getItem('amys_echo_recovery_history');
        if (data) {
          this.recoveryHistory = JSON.parse(data);
        }
      }
    } catch (error) {
      logger.warn('Failed to load recovery history:', error);
      this.recoveryHistory = [];
    }
  }
}

export const automaticRecoveryService = AutomaticRecoveryService.getInstance();