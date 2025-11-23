// @ts-nocheck
/**
 * Gesture Undo Manager - Amy First
 * Provides simple gesture-based undo functionality
 */

export interface UndoableGesture {
  gesture: string;
  confidence: number;
  timestamp: number;
  landmarks: number[][][];
  handedness: string[];
  sessionId: string;
  canUndo: boolean;
}

export interface UndoGesture {
  name: string;
  gesture: string; // The actual gesture to detect
  minConfidence: number;
  cooldownMs: number; // Prevent accidental repeated undos
  holdDuration: number; // How long to hold the gesture
  feedback: {
    message: string;
    hapticPattern: 'light' | 'medium' | 'heavy';
    soundEnabled: boolean;
  };
}

export interface UndoSession {
  undoGesture: UndoGesture;
  targetGesture: UndoableGesture;
  timestamp: number;
  confirmed: boolean;
  sessionId: string;
  context?: unknown;
}

export class GestureUndoManager {
  private gestureHistory: UndoableGesture[] = [];
  private readonly MAX_HISTORY = 5; // Keep last 5 gestures for undo
  private readonly UNDO_WINDOW = 10000; // 10 seconds to undo

  private undoGestures: UndoGesture[] = [
    {
      name: 'shake_undo',
      gesture: 'wave', // Waving hand as shake motion
      minConfidence: 0.7,
      cooldownMs: 3000, // 3 second cooldown
      holdDuration: 800, // Hold for 800ms
      feedback: {
        message: 'Undoing last gesture! ↶',
        hapticPattern: 'medium',
        soundEnabled: true
      }
    },
    {
      name: 'cross_undo',
      gesture: 'thumbs_down', // Thumbs down as rejection
      minConfidence: 0.7,
      cooldownMs: 2000,
      holdDuration: 600,
      feedback: {
        message: 'Cancelling that! ❌',
        hapticPattern: 'light',
        soundEnabled: true
      }
    }
  ];

  private lastUndoTime: Record<string, number> = {};
  private undoHoldStart: Record<string, number> = {};
  private activeUndoSession: UndoSession | null = null;

  /**
   * Record a gesture for potential undo
   */
  recordGestureForUndo(
    gesture: string,
    confidence: number,
    landmarks: number[][][],
    handedness: string[],
    sessionId: string
  ): void {
    if (confidence < 0.6) {
      return; // Only record confident gestures
    }

    const undoableGesture: UndoableGesture = {
      gesture,
      confidence,
      timestamp: Date.now(),
      landmarks: JSON.parse(JSON.stringify(landmarks)), // Deep copy
      handedness: [...handedness],
      sessionId,
      canUndo: true
    };

    this.gestureHistory.push(undoableGesture);

    // Maintain history size
    if (this.gestureHistory.length > this.MAX_HISTORY) {
      this.gestureHistory.shift();
    }

    // Clean old gestures
    this.cleanOldGestures();
  }

  /**
   * Check if a gesture should trigger undo
   */
  checkUndoTrigger(
    gesture: string,
    confidence: number,
    context?: unknown
  ): UndoSession | null {
    // Find matching undo gesture
    const undoGesture = this.undoGestures.find(ug => ug.gesture === gesture);
    if (!undoGesture) {
      return null;
    }

    // Check confidence threshold
    if (confidence < undoGesture.minConfidence) {
      return null;
    }

    // Check cooldown
    const lastUndo = this.lastUndoTime[undoGesture.name] || 0;
    const now = Date.now();
    if (now - lastUndo < undoGesture.cooldownMs) {
      return null;
    }

    // Check if there's something to undo
    const targetGesture = this.getLastUndoableGesture();
    if (!targetGesture) {
      return null; // Nothing to undo
    }

    // Check hold duration
    const holdStart = this.undoHoldStart[undoGesture.name];
    if (!holdStart) {
      // Start holding timer
      this.undoHoldStart[undoGesture.name] = now;
      return null;
    }

    // Check if held long enough
    if (now - holdStart < undoGesture.holdDuration) {
      return null;
    }

    // Create undo session
    const sessionId = `undo_${now}_${GestureUndoManager.generateSecureRandomString()}`;
    const session: UndoSession = {
      undoGesture,
      targetGesture,
      timestamp: now,
      confirmed: false,
      sessionId,
      context
    };

    this.activeUndoSession = session;

    // Record undo time and reset hold timer
    this.lastUndoTime[undoGesture.name] = now;
    delete this.undoHoldStart[undoGesture.name];

    return session;
  }

  /**
   * Confirm and execute undo
   */
  confirmUndo(sessionId: string): boolean {
    if (!this.activeUndoSession || this.activeUndoSession.sessionId !== sessionId) {
      return false;
    }

    const session = this.activeUndoSession;
    session.confirmed = true;

    // Mark the target gesture as undone
    const targetIndex = this.gestureHistory.findIndex(
      g => g.sessionId === session.targetGesture.sessionId
    );

    if (targetIndex >= 0) {
      this.gestureHistory[targetIndex].canUndo = false;
    }

    // Send undo confirmation to React Native
    this.sendUndoToReactNative(session);

    // Clear active session
    this.activeUndoSession = null;

    return true;
  }

  /**
   * Cancel undo session
   */
  cancelUndo(sessionId: string): boolean {
    if (!this.activeUndoSession || this.activeUndoSession.sessionId !== sessionId) {
      return false;
    }

    this.activeUndoSession = null;
    return true;
  }

  private static generateSecureRandomString(lengthBytes = 12): string {
    const cryptoObj =
      typeof globalThis !== 'undefined' && 'crypto' in globalThis
        ? (globalThis as unknown as { crypto?: Crypto }).crypto
        : undefined;
    if (cryptoObj?.getRandomValues) {
      const array = new Uint8Array(lengthBytes);
      cryptoObj.getRandomValues(array);
      return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    return Math.random().toString(16).slice(2, 2 + lengthBytes * 2);
  }

  /**
   * Get the last undoable gesture
   */
  getLastUndoableGesture(): UndoableGesture | null {
    const now = Date.now();

    // Find the most recent undoable gesture within the time window
    for (let i = this.gestureHistory.length - 1; i >= 0; i--) {
      const gesture = this.gestureHistory[i];
      if (gesture.canUndo && (now - gesture.timestamp) <= this.UNDO_WINDOW) {
        return gesture;
      }
    }

    return null;
  }

  /**
   * Get undoable gestures history
   */
  getUndoableGestures(): UndoableGesture[] {
    const now = Date.now();
    return this.gestureHistory.filter(
      g => g.canUndo && (now - g.timestamp) <= this.UNDO_WINDOW
    );
  }

  /**
   * Reset hold timers (when gesture changes)
   */
  resetHoldTimers(): void {
    this.undoHoldStart = {};
  }

  /**
   * Get current undo session
   */
  getCurrentUndoSession(): UndoSession | null {
    return this.activeUndoSession;
  }

  /**
   * Get undo gesture by name
   */
  getUndoGesture(gestureName: string): UndoGesture | null {
    return this.undoGestures.find(ug => ug.name === gestureName) || null;
  }

  /**
   * Add custom undo gesture
   */
  addCustomUndoGesture(gesture: UndoGesture): void {
    // Check if gesture already exists
    const existingIndex = this.undoGestures.findIndex(ug => ug.name === gesture.name);
    if (existingIndex >= 0) {
      this.undoGestures[existingIndex] = gesture;
    } else {
      this.undoGestures.push(gesture);
    }
  }

  /**
   * Get undo hold progress
   */
  getUndoHoldProgress(gestureName: string): number {
    const holdStart = this.undoHoldStart[gestureName];
    if (!holdStart) {
      return 0;
    }

    const undoGesture = this.undoGestures.find(ug => ug.name === gestureName);
    if (!undoGesture) {
      return 0;
    }

    const elapsed = Date.now() - holdStart;
    return Math.min(1, elapsed / undoGesture.holdDuration);
  }

  /**
   * Get undo statistics
   */
  getUndoStats(): {
    totalUndos: number;
    undoRate: number;
    mostUsedUndoGesture: string;
    averageTimeToUndo: number;
  } {
    const now = Date.now();
    const recentUndos = Object.values(this.lastUndoTime).filter(
      time => now - time < 3600000 // Last hour
    );

    const totalUndos = recentUndos.length;
    const undoRate = this.gestureHistory.length > 0 ? totalUndos / this.gestureHistory.length : 0;

    // Count undo gesture usage
    const undoUsage: Record<string, number> = {};
    Object.keys(this.lastUndoTime).forEach(gestureName => {
      undoUsage[gestureName] = (undoUsage[gestureName] || 0) + 1;
    });

    const mostUsedUndoGesture = Object.entries(undoUsage)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'none';

    // Calculate average time to undo (simplified)
    const averageTimeToUndo = totalUndos > 0 ? this.UNDO_WINDOW / 2 : 0; // Rough estimate

    return {
      totalUndos,
      undoRate,
      mostUsedUndoGesture,
      averageTimeToUndo
    };
  }

  /**
   * Send undo command to React Native
   */
  private sendUndoToReactNative(session: UndoSession): void {
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'gesture_undo',
          sessionId: session.sessionId,
          undoneGesture: session.targetGesture.gesture,
          undoGesture: session.undoGesture.gesture,
          feedback: session.undoGesture.feedback,
          timestamp: session.timestamp,
          context: session.context ?? null
        })
      );
    } catch (error) {
      console.warn('Failed to send undo command:', error);
    }
  }

  /**
   * Clean old gestures from history
   */
  private cleanOldGestures(): void {
    const now = Date.now();
    this.gestureHistory = this.gestureHistory.filter(
      g => (now - g.timestamp) <= this.UNDO_WINDOW
    );
  }

  /**
   * Reset undo state
   */
  reset(): void {
    this.gestureHistory = [];
    this.lastUndoTime = {};
    this.undoHoldStart = {};
    this.activeUndoSession = null;
  }

  /**
   * Export undo configuration
   */
  exportConfiguration(): UndoGesture[] {
    return [...this.undoGestures];
  }

  /**
   * Import undo configuration
   */
  importConfiguration(config: UndoGesture[]): void {
    this.undoGestures = [...config];
  }
}