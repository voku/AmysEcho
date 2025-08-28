import { startSession as startEngagement, endSession as endEngagement } from './engagementTracker';

import { SessionCallbacks } from '../types';

export class ChildSessionManager {
  private encouragementInterval: number;
  private breakInterval: number;
  private encouragementTimer?: NodeJS.Timeout;
  private breakTimer?: NodeJS.Timeout;
  private callbacks: SessionCallbacks;
  private profileId: string;

  constructor(
    callbacks: SessionCallbacks,
    profileId: string,
    encouragementInterval = 5 * 60 * 1000,
    breakInterval = 20 * 60 * 1000,
  ) {
    this.callbacks = callbacks;
    this.profileId = profileId;
    this.encouragementInterval = encouragementInterval;
    this.breakInterval = breakInterval;
  }

  startSession(): void {
    this.clearTimers();
    void startEngagement();
    this.scheduleEncouragement();
    this.scheduleBreak();
  }

  recordActivity(): void {
    this.scheduleEncouragement();
  }

  endSession(): void {
    this.clearTimers();
    void endEngagement(this.profileId);
  }

  private scheduleEncouragement(): void {
    if (this.encouragementTimer) clearTimeout(this.encouragementTimer);
    this.encouragementTimer = setTimeout(() => {
      this.callbacks.onEncouragement();
      this.scheduleEncouragement();
    }, this.encouragementInterval);
  }

  private scheduleBreak(): void {
    if (this.breakTimer) clearTimeout(this.breakTimer);
    this.breakTimer = setTimeout(() => {
      this.callbacks.onBreak();
    }, this.breakInterval);
  }

  private clearTimers(): void {
    if (this.encouragementTimer) clearTimeout(this.encouragementTimer);
    if (this.breakTimer) clearTimeout(this.breakTimer);
  }
}

export default ChildSessionManager;
