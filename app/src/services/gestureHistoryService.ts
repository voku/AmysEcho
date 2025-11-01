import AsyncStorage from '@react-native-async-storage/async-storage';
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
  private analyticsHistory: GestureHistoryEntry[] = [];
  private pendingGestures: GestureHistoryEntry[] = [];
  private readonly MAX_HISTORY = 10;
  private readonly MAX_ANALYTICS_ENTRIES = 1000;
  private readonly ANALYTICS_RETENTION_DAYS = 30;
  private readonly STORAGE_KEY = 'amys_echo_gesture_history';
  private hydrationPromise: Promise<void>;
  private isHydrated = false;

  static getInstance(): GestureHistoryService {
    if (!GestureHistoryService.instance) {
      GestureHistoryService.instance = new GestureHistoryService();
    }
    return GestureHistoryService.instance;
  }

  private constructor() {
    this.hydrationPromise = this.loadHistory()
      .finally(() => {
        this.mergePendingGestures();
        this.isHydrated = true;
      });
  }

  ready(): Promise<void> {
    return this.hydrationPromise;
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

    this.enforceRecentHistoryRetention();

    this.analyticsHistory.unshift(entry);
    this.analyticsHistory = this.sanitizeAnalyticsHistory(this.analyticsHistory);

    if (!this.isHydrated) {
      this.pendingGestures.unshift(entry);
    }

    void this.saveHistory();
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
    const historySource = this.analyticsHistory;

    if (historySource.length === 0) {
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

    historySource.forEach(entry => {
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
    for (let i = 0; i < historySource.length; i++) {
      const entry = historySource[i];
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
      totalGestures: historySource.length,
      successRate: historySource.length > 0 ? 1 : 0, // All stored gestures are successful
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
      const analyticsIndex = this.analyticsHistory.findIndex(entry =>
        entry.id === removed.id && entry.timestamp === removed.timestamp
      );
      if (analyticsIndex !== -1) {
        this.analyticsHistory.splice(analyticsIndex, 1);
      }
      this.enforceRecentHistoryRetention();
      void this.saveHistory();
      logger.debug('Last gesture removed from history:', removed.label);
    }
    return removed || null;
  }

  /**
   * Clear all history
   */
  clearHistory(): void {
    this.history = [];
    this.analyticsHistory = [];
    void this.saveHistory();
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
      this.enforceRecentHistoryRetention();
      this.analyticsHistory = this.sanitizeAnalyticsHistory(this.analyticsHistory);
      const payload = {
        recent: this.history.slice(0, this.MAX_HISTORY),
        analytics: this.analyticsHistory.slice(0, this.MAX_ANALYTICS_ENTRIES)
      };
      const data = JSON.stringify(payload);
      let persisted = false;

      try {
        await AsyncStorage.setItem(this.STORAGE_KEY, data);
        persisted = true;
      } catch (asyncError) {
        logger.warn('Failed to save gesture history with AsyncStorage:', asyncError);
      }

      if (!persisted && typeof window !== 'undefined' && window.localStorage) {
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
      const data = await this.loadPersistedData();
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          this.analyticsHistory = this.sanitizeAnalyticsHistory(parsed);
          this.history = this.analyticsHistory.slice(0, this.MAX_HISTORY);
        } else {
          const recent = Array.isArray(parsed?.recent) ? parsed.recent : [];
          const analytics = Array.isArray(parsed?.analytics) ? parsed.analytics : recent;
          const normalizeEntry = (entry: unknown): entry is GestureHistoryEntry =>
            typeof entry === 'object'
            && entry !== null
            && typeof (entry as { timestamp?: unknown }).timestamp === 'number'
            && typeof (entry as { id?: unknown }).id === 'string'
            && typeof (entry as { label?: unknown }).label === 'string'
            && typeof (entry as { emoji?: unknown }).emoji === 'string'
            && typeof (entry as { confidence?: unknown }).confidence === 'number';

          this.analyticsHistory = this.sanitizeAnalyticsHistory(
            analytics.filter(normalizeEntry),
          );
          this.history = recent.filter(normalizeEntry);
          if (this.history.length === 0) {
            this.history = this.analyticsHistory.slice(0, this.MAX_HISTORY);
          }
        }
        this.enforceRecentHistoryRetention();
      }
    } catch (error) {
      logger.warn('Failed to load gesture history:', error);
      this.history = [];
      this.analyticsHistory = [];
    }
  }

  private mergePendingGestures(): void {
    if (this.pendingGestures.length === 0) {
      return;
    }

    const dedupe = (entries: GestureHistoryEntry[]): GestureHistoryEntry[] => {
      const seen = new Set<string>();
      return entries.filter(entry => {
        const key = `${entry.id}-${entry.timestamp}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
    };

    const mergedAnalytics = dedupe([
      ...this.pendingGestures,
      ...this.analyticsHistory,
    ]);
    this.analyticsHistory = this.sanitizeAnalyticsHistory(mergedAnalytics);

    const mergedRecent = dedupe([
      ...this.pendingGestures,
      ...this.history,
    ]);
    this.history = mergedRecent
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, this.MAX_HISTORY);

    this.enforceRecentHistoryRetention();
    this.pendingGestures = [];
    void this.saveHistory();
  }

  private async loadPersistedData(): Promise<string | null> {
    try {
      const data = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (data) {
        return data;
      }
    } catch (asyncError) {
      logger.warn('Failed to load gesture history from AsyncStorage:', asyncError);
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        return window.localStorage.getItem(this.STORAGE_KEY);
      } catch (webError) {
        logger.warn('Failed to load gesture history from localStorage:', webError);
      }
    }

    return null;
  }

  private sanitizeAnalyticsHistory(entries: GestureHistoryEntry[]): GestureHistoryEntry[] {
    const normalized = entries
      .filter(entry => typeof entry.timestamp === 'number')
      .sort((a, b) => b.timestamp - a.timestamp);

    const retentionCutoff = Date.now() - (this.ANALYTICS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const filtered = normalized.filter(entry => entry.timestamp >= retentionCutoff);

    if (filtered.length > this.MAX_ANALYTICS_ENTRIES) {
      return filtered.slice(0, this.MAX_ANALYTICS_ENTRIES);
    }

    return filtered;
  }

  private enforceRecentHistoryRetention(): void {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    this.history = this.history
      .filter(entry => typeof entry.timestamp === 'number' && entry.timestamp >= oneDayAgo)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, this.MAX_HISTORY);
  }
}

export const gestureHistoryService = GestureHistoryService.getInstance();