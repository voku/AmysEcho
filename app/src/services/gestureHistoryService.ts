import { logger } from '../utils/logger';

export interface GestureHistoryEntry {
  id: string;
  label: string;
  emoji: string;
  timestamp: number;
  confidence: number;
  landmarks?: number[][][];
  category?: string;
  audioResponse?: string;
}

export interface GestureUsageSummary {
  id: string;
  label: string;
  count: number;
}

export interface GestureHistoryStats {
  totalGestures: number;
  successRate: number;
  mostUsedGesture: GestureUsageSummary | null;
  recentActivity: {
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
  communicationStreak: number; // consecutive successful gestures
}

class GestureHistoryService {
  private static instance: GestureHistoryService;
  private history: GestureHistoryEntry[] = [];
  private readonly MAX_HISTORY = 10;
  private readonly STORAGE_KEY = 'amys_echo_gesture_history';

  static getInstance(): GestureHistoryService {
    if (!GestureHistoryService.instance) {
      GestureHistoryService.instance = new GestureHistoryService();
    }
    return GestureHistoryService.instance;
  }

  private constructor() {
    this.loadHistory();
  }

  /**
   * Add a gesture to history
   */
  addGesture(gesture: Omit<GestureHistoryEntry, 'timestamp'>): void {
    const entry: GestureHistoryEntry = {
      ...gesture,
      timestamp: Date.now()
    };

    this.history.unshift(entry); // Add to beginning

    // Keep only the most recent entries
    if (this.history.length > this.MAX_HISTORY) {
      this.history = this.history.slice(0, this.MAX_HISTORY);
    }

    this.saveHistory();
    logger.debug('Gesture added to history:', entry.label);
  }

  /**
   * Get recent gesture history
   */
  getRecentHistory(limit?: number): GestureHistoryEntry[] {
    return this.history.slice(0, limit || this.MAX_HISTORY);
  }

  /**
   * Get the last successful gesture
   */
  getLastGesture(): GestureHistoryEntry | null {
    return this.history[0] || null;
  }

  /**
   * Get gesture by ID from history
   */
  getGestureById(id: string): GestureHistoryEntry | null {
    return this.history.find(entry => entry.id === id) || null;
  }

  /**
   * Get gestures from the last N minutes
   */
  getRecentGestures(minutes: number): GestureHistoryEntry[] {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    return this.history.filter(entry => entry.timestamp > cutoff);
  }

  /**
   * Get communication statistics
   */
  getStats(): GestureHistoryStats {
    if (this.history.length === 0) {
      return {
        totalGestures: 0,
        successRate: 0,
        mostUsedGesture: null,
        recentActivity: {
          today: 0,
          thisWeek: 0,
          thisMonth: 0
        },
        communicationStreak: 0
      };
    }

    const now = Date.now();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(startOfDay);
    const dayOfWeek = (startOfWeek.getDay() + 6) % 7; // Monday as start of week
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);

    const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);

    const usageByGesture = new Map<string, GestureUsageSummary>();
    let todayCount = 0;
    let thisWeekCount = 0;
    let thisMonthCount = 0;

    this.history.forEach(entry => {
      const usage = usageByGesture.get(entry.label);
      if (usage) {
        usage.count += 1;
      } else {
        usageByGesture.set(entry.label, {
          id: entry.id,
          label: entry.label,
          count: 1
        });
      }

      const entryDate = new Date(entry.timestamp);
      if (entryDate.getTime() >= startOfDay.getTime()) {
        todayCount += 1;
      }
      if (entryDate.getTime() >= startOfWeek.getTime()) {
        thisWeekCount += 1;
      }
      if (entryDate.getTime() >= startOfMonth.getTime()) {
        thisMonthCount += 1;
      }
    });

    const mostUsed = Array.from(usageByGesture.values()).sort((a, b) => b.count - a.count)[0] ?? null;

    // Calculate communication streak (consecutive gestures within reasonable time gaps)
    let streak = 0;
    for (let i = 0; i < this.history.length; i++) {
      const entry = this.history[i];
      if (!entry) {
        break;
      }
      const timeDiff = now - entry.timestamp;
      // Consider it part of streak if within 5 minutes
      if (timeDiff < 5 * 60 * 1000) {
        streak++;
      } else {
        break;
      }
    }

    return {
      totalGestures: this.history.length,
      successRate: this.history.length > 0 ? 1 : 0, // All stored gestures are successful
      mostUsedGesture: mostUsed,
      recentActivity: {
        today: todayCount,
        thisWeek: thisWeekCount,
        thisMonth: thisMonthCount
      },
      communicationStreak: streak
    };
  }

  /**
   * Remove the last gesture from history
   */
  removeLastGesture(): GestureHistoryEntry | null {
    const removed = this.history.shift();
    if (removed) {
      this.saveHistory();
      logger.debug('Last gesture removed from history:', removed.label);
    }
    return removed || null;
  }

  /**
   * Clear all history
   */
  clearHistory(): void {
    this.history = [];
    this.saveHistory();
    logger.info('Gesture history cleared');
  }

  /**
   * Get history for emergency replay
   */
  getEmergencyReplayHistory(): GestureHistoryEntry[] {
    // Return last 5 gestures for emergency situations
    return this.history.slice(0, 5);
  }

  /**
   * Replay a specific gesture from history
   */
  replayGesture(gestureId: string): GestureHistoryEntry | null {
    const gesture = this.getGestureById(gestureId);
    if (gesture) {
      logger.info('Replaying gesture from history:', gesture.label);
      // Here you could trigger the audio response again
      // This would integrate with the audio service
    }
    return gesture;
  }

  /**
   * Save history to persistent storage
   */
  private async saveHistory(): Promise<void> {
    try {
      const data = JSON.stringify(this.history);
      // In a real app, this would use AsyncStorage or similar
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(this.STORAGE_KEY, data);
      }
    } catch (error) {
      logger.warn('Failed to save gesture history:', error);
    }
  }

  /**
   * Load history from persistent storage
   */
  private async loadHistory(): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const data = window.localStorage.getItem(this.STORAGE_KEY);
        if (data) {
          this.history = JSON.parse(data);
          // Sort newest first to match in-memory ordering
          this.history.sort((a, b) => b.timestamp - a.timestamp);
          // Validate and clean up old entries (older than 24 hours)
          const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
          this.history = this.history.filter(entry => entry.timestamp > oneDayAgo);
        }
      }
    } catch (error) {
      logger.warn('Failed to load gesture history:', error);
      this.history = [];
    }
  }
}

export const gestureHistoryService = GestureHistoryService.getInstance();