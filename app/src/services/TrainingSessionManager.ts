import { validateLandmarkSequence, ValidationResult } from './TrainingDataValidator';

export interface TrainingSample {
  id: string;
  gestureId: string;
  landmarks: number[][][];
  timestamp: number;
  qualityScore: number;
  validationResult: ValidationResult;
}

export interface TrainingSession {
  id: string;
  gestureId: string;
  startTime: number;
  samples: TrainingSample[];
  targetSamples: number;
  status: 'active' | 'completed' | 'cancelled';
  averageQuality: number;
}

export interface TrainingFeedback {
  message: string;
  type: 'success' | 'warning' | 'error' | 'info';
  qualityScore?: number;
  suggestions?: string[];
}

export class TrainingSessionManager {
  private currentSession: TrainingSession | null = null;
  private sessionCallbacks: Array<(session: TrainingSession) => void> = [];

  /**
   * Start a new training session
   */
  startSession(gestureId: string, targetSamples = 10): TrainingSession {
    this.currentSession = {
      id: `session_${Date.now()}`,
      gestureId,
      startTime: Date.now(),
      samples: [],
      targetSamples,
      status: 'active',
      averageQuality: 0,
    };

    this.notifyCallbacks();
    return this.currentSession;
  }

  /**
   * Add a sample to the current session
   */
  addSample(landmarks: number[][][]): TrainingFeedback | null {
    if (!this.currentSession || this.currentSession.status !== 'active') {
      return {
        message: 'No active training session',
        type: 'error'
      };
    }

    // Validate the sample
    const validationResult = validateLandmarkSequence([landmarks.map(hand =>
      hand.map(lm => {
        const [x, y, z] = lm ?? [];
        return [x ?? 0, y ?? 0, z ?? 0];
      })
    )]);

    // Create sample
    const sample: TrainingSample = {
      id: `sample_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      gestureId: this.currentSession.gestureId,
      landmarks,
      timestamp: Date.now(),
      qualityScore: validationResult.qualityScore,
      validationResult,
    };

    this.currentSession.samples.push(sample);
    this.updateAverageQuality();

    // Check if session is complete
    if (this.currentSession.samples.length >= this.currentSession.targetSamples) {
      this.completeSession();
    }

    this.notifyCallbacks();

    return this.generateFeedback(sample);
  }

  /**
   * Complete the current session
   */
  completeSession(): void {
    if (this.currentSession) {
      this.currentSession.status = 'completed';
      this.notifyCallbacks();
    }
  }

  /**
   * Cancel the current session
   */
  cancelSession(): void {
    if (this.currentSession) {
      this.currentSession.status = 'cancelled';
      this.notifyCallbacks();
    }
  }

  /**
   * Get current session progress
   */
  getProgress(): { current: number; target: number; percentage: number } | null {
    if (!this.currentSession) return null;

    const current = this.currentSession.samples.length;
    const target = this.currentSession.targetSamples;
    const percentage = Math.min(100, (current / target) * 100);

    return { current, target, percentage };
  }

  /**
   * Get current session
   */
  getCurrentSession(): TrainingSession | null {
    return this.currentSession;
  }

  /**
   * Subscribe to session updates
   */
  onSessionUpdate(callback: (session: TrainingSession) => void): () => void {
    this.sessionCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.sessionCallbacks.indexOf(callback);
      if (index > -1) {
        this.sessionCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Update average quality score
   */
  private updateAverageQuality(): void {
    if (!this.currentSession) return;

    const totalQuality = this.currentSession.samples.reduce(
      (sum, sample) => sum + sample.qualityScore,
      0
    );
    const sampleCount = this.currentSession.samples.length || 1;
    this.currentSession.averageQuality = totalQuality / sampleCount;
  }

  /**
   * Generate feedback for a sample
   */
  private generateFeedback(sample: TrainingSample): TrainingFeedback {
    const { validationResult } = sample;

    if (validationResult.ok) {
      let message = 'Great sample!';
      if (validationResult.qualityScore >= 90) {
        message = 'Excellent sample! Perfect quality.';
      } else if (validationResult.qualityScore >= 75) {
        message = 'Good sample! Well done.';
      }

      return {
        message,
        type: 'success',
        qualityScore: validationResult.qualityScore,
      };
    } else {
      return {
        message: 'Sample needs improvement',
        type: 'warning',
        qualityScore: validationResult.qualityScore,
        suggestions: validationResult.suggestions,
      };
    }
  }

  /**
   * Notify all callbacks of session updates
   */
  private notifyCallbacks(): void {
    if (this.currentSession) {
      this.sessionCallbacks.forEach(callback => {
        try {
          callback(this.currentSession!);
        } catch (error) {
          console.error('Error in session callback:', error);
        }
      });
    }
  }
}

// Export singleton instance
export const trainingSessionManager = new TrainingSessionManager();