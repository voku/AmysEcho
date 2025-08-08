export type SessionCallbacks = {
  onEncouragement: () => void;
  onBreak: () => void;
};

export class ChildSessionManager {
  private encouragementInterval: number;
  private breakInterval: number;
  private encouragementTimer?: NodeJS.Timeout;
  private breakTimer?: NodeJS.Timeout;
  private callbacks: SessionCallbacks;

  constructor(
    callbacks: SessionCallbacks,
    encouragementInterval = 5 * 60 * 1000,
    breakInterval = 20 * 60 * 1000,
  ) {
    this.callbacks = callbacks;
    this.encouragementInterval = encouragementInterval;
    this.breakInterval = breakInterval;
  }

  startSession(): void {
    this.clearTimers();
    this.scheduleEncouragement();
    this.scheduleBreak();
  }

  recordActivity(): void {
    this.scheduleEncouragement();
  }

  endSession(): void {
    this.clearTimers();
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
