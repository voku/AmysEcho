import { logger } from '../utils/logger';

export interface EmergencyGesture {
  id: string;
  gesture: string;
  confidence: number;
  timestamp: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  context?: string;
  processed: boolean;
}

export interface PriorityQueueStats {
  queueLength: number;
  criticalCount: number;
  highCount: number;
  processingRate: number; // gestures per second
  averageWaitTime: number; // milliseconds
}

class EmergencyPriorityService {
  private static instance: EmergencyPriorityService;
  private emergencyQueue: EmergencyGesture[] = [];
  private processingQueue: EmergencyGesture[] = [];
  private readonly MAX_QUEUE_SIZE = 10;
  private readonly PROCESSING_TIMEOUT = 5000; // 5 seconds
  private isProcessing = false;
  private stats: PriorityQueueStats = {
    queueLength: 0,
    criticalCount: 0,
    highCount: 0,
    processingRate: 0,
    averageWaitTime: 0
  };

  // Emergency gesture definitions
  private readonly EMERGENCY_GESTURES = new Set([
    'hilfe', 'help', 'emergency', 'stop', 'danger', 'notfall', 'gefahr'
  ]);

  static getInstance(): EmergencyPriorityService {
    if (!EmergencyPriorityService.instance) {
      EmergencyPriorityService.instance = new EmergencyPriorityService();
    }
    return EmergencyPriorityService.instance;
  }

  private constructor() {
    this.startProcessingLoop();
  }

  /**
   * Add emergency gesture to priority queue
   */
  addEmergencyGesture(
    gesture: string,
    confidence: number,
    context?: string
  ): boolean {
    // Check if this is actually an emergency gesture
    if (!this.isEmergencyGesture(gesture)) {
      return false;
    }

    const emergencyGesture: EmergencyGesture = {
      id: `emergency_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      gesture,
      confidence,
      timestamp: Date.now(),
      priority: this.calculatePriority(gesture, confidence),
      context,
      processed: false
    };

    // Add to queue with priority ordering
    this.addToQueue(emergencyGesture);

    logger.info(`Emergency gesture added to priority queue: ${gesture} (priority: ${emergencyGesture.priority})`);

    // Update stats
    this.updateStats();

    return true;
  }

  /**
   * Process next emergency gesture in queue
   */
  async processNextEmergency(): Promise<EmergencyGesture | null> {
    if (this.emergencyQueue.length === 0) {
      return null;
    }

    // Get highest priority gesture
    const nextGesture = this.emergencyQueue.shift();
    if (!nextGesture) return null;

    nextGesture.processed = true;
    this.processingQueue.push(nextGesture);

    // Process the emergency gesture
    await this.processEmergencyGesture(nextGesture);

    // Update stats
    this.updateStats();

    return nextGesture;
  }

  /**
   * Get current queue status
   */
  getQueueStatus(): {
    queueLength: number;
    nextGesture?: EmergencyGesture;
    criticalCount: number;
    isProcessing: boolean;
  } {
    return {
      queueLength: this.emergencyQueue.length,
      nextGesture: this.emergencyQueue[0],
      criticalCount: this.emergencyQueue.filter(g => g.priority === 'critical').length,
      isProcessing: this.isProcessing
    };
  }

  /**
   * Get processing statistics
   */
  getStats(): PriorityQueueStats {
    return { ...this.stats };
  }

  /**
   * Clear all emergency gestures from queue
   */
  clearQueue(): void {
    const clearedCount = this.emergencyQueue.length;
    this.emergencyQueue = [];
    this.processingQueue = [];
    this.updateStats();
    logger.info(`Emergency queue cleared: ${clearedCount} gestures removed`);
  }

  /**
   * Check if gesture should be treated as emergency
   */
  isEmergencyGesture(gesture: string): boolean {
    const normalizedGesture = gesture.toLowerCase().trim();
    return this.EMERGENCY_GESTURES.has(normalizedGesture);
  }

  /**
   * Get appropriate response for emergency gesture
   */
  getEmergencyResponse(gesture: string): {
    message: string;
    action: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
  } {
    const normalizedGesture = gesture.toLowerCase().trim();

    switch (normalizedGesture) {
      case 'hilfe':
      case 'help':
        return {
          message: '🆘 Hilfe wird gerufen!',
          action: 'call_help',
          priority: 'critical'
        };
      case 'emergency':
      case 'notfall':
        return {
          message: '🚨 Notfall erkannt!',
          action: 'emergency_alert',
          priority: 'critical'
        };
      case 'stop':
        return {
          message: '⏹️ Stopp erkannt!',
          action: 'stop_current',
          priority: 'high'
        };
      case 'danger':
      case 'gefahr':
        return {
          message: '⚠️ Gefahr erkannt!',
          action: 'danger_alert',
          priority: 'critical'
        };
      default:
        return {
          message: '⚠️ Dringende Geste erkannt!',
          action: 'general_alert',
          priority: 'medium'
        };
    }
  }

  /**
   * Calculate priority based on gesture and confidence
   */
  private calculatePriority(gesture: string, confidence: number): 'low' | 'medium' | 'high' | 'critical' {
    const response = this.getEmergencyResponse(gesture);

    // Adjust priority based on confidence
    if (confidence >= 0.9) {
      return response.priority;
    } else if (confidence >= 0.7) {
      // Slightly lower priority for lower confidence
      switch (response.priority) {
        case 'critical': return 'high';
        case 'high': return 'medium';
        case 'medium': return 'low';
        default: return 'low';
      }
    } else {
      return 'low';
    }
  }

  /**
   * Add gesture to queue with priority ordering
   */
  private addToQueue(gesture: EmergencyGesture): void {
    // Insert in priority order (higher priority first)
    const insertIndex = this.emergencyQueue.findIndex(
      existing => this.getPriorityWeight(existing.priority) < this.getPriorityWeight(gesture.priority)
    );

    if (insertIndex === -1) {
      // Add to end if no lower priority found
      this.emergencyQueue.push(gesture);
    } else {
      // Insert before first lower priority
      this.emergencyQueue.splice(insertIndex, 0, gesture);
    }

    // Maintain queue size limit
    if (this.emergencyQueue.length > this.MAX_QUEUE_SIZE) {
      const removed = this.emergencyQueue.pop();
      if (removed) {
        logger.warn(`Emergency queue full, dropped gesture: ${removed.gesture}`);
      }
    }
  }

  /**
   * Process emergency gesture
   */
  private async processEmergencyGesture(gesture: EmergencyGesture): Promise<void> {
    const startTime = Date.now();

    try {
      const response = this.getEmergencyResponse(gesture.gesture);

      // Log emergency processing
      logger.info(`Processing emergency gesture: ${gesture.gesture} (${gesture.priority})`);

      // Here you would trigger the appropriate emergency response
      // For example: call help, send alert, stop current activity, etc.

      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 100));

      // Remove from processing queue
      const index = this.processingQueue.indexOf(gesture);
      if (index > -1) {
        this.processingQueue.splice(index, 1);
      }

      const processingTime = Date.now() - startTime;
      logger.info(`Emergency gesture processed in ${processingTime}ms: ${gesture.gesture}`);

    } catch (error) {
      logger.error(`Failed to process emergency gesture: ${gesture.gesture}`, error);

      // Remove from processing queue on error
      const index = this.processingQueue.indexOf(gesture);
      if (index > -1) {
        this.processingQueue.splice(index, 1);
      }
    }
  }

  /**
   * Start background processing loop
   */
  private startProcessingLoop(): void {
    setInterval(async () => {
      if (!this.isProcessing && this.emergencyQueue.length > 0) {
        this.isProcessing = true;
        await this.processNextEmergency();
        this.isProcessing = false;
      }
    }, 100); // Process every 100ms
  }

  /**
   * Update queue statistics
   */
  private updateStats(): void {
    const now = Date.now();
    const recentProcessing = this.processingQueue.filter(
      g => now - g.timestamp < 60000 // Last minute
    );

    this.stats = {
      queueLength: this.emergencyQueue.length,
      criticalCount: this.emergencyQueue.filter(g => g.priority === 'critical').length,
      highCount: this.emergencyQueue.filter(g => g.priority === 'high').length,
      processingRate: recentProcessing.length / 60, // per second
      averageWaitTime: this.calculateAverageWaitTime()
    };
  }

  /**
   * Calculate average wait time for processed gestures
   */
  private calculateAverageWaitTime(): number {
    if (this.processingQueue.length === 0) return 0;

    const totalWaitTime = this.processingQueue.reduce((sum, gesture) => {
      return sum + (Date.now() - gesture.timestamp);
    }, 0);

    return totalWaitTime / this.processingQueue.length;
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
}

export const emergencyPriorityService = EmergencyPriorityService.getInstance();