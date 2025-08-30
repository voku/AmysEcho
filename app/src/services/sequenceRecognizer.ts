export interface SequenceDefinition {
  id: string;
  pattern: string[]; // e.g., ['more', 'please']
  windowMs: number; // max time window to match whole sequence
}

export class SequenceRecognizer {
  private events: { g: string; t: number }[] = [];
  private maxWindow: number;
  private maxLen: number;

  constructor(private defs: SequenceDefinition[]) {
    this.maxWindow = this.defs.reduce((m, d) => Math.max(m, d.windowMs), 0);
    this.maxLen = this.defs.reduce((m, d) => Math.max(m, d.pattern.length), 0);
  }

  push(gesture: string, timestamp: number = Date.now()): string | null {
    // Add event and prune > max window while bounding history size
    this.events.push({ g: gesture, t: timestamp });
    const cutoff = timestamp - this.maxWindow;
    while (this.events.length && this.events[0].t < cutoff) {
      this.events.shift();
    }
    if (this.events.length > this.maxLen) {
      this.events.splice(0, this.events.length - this.maxLen);
    }

    for (const d of this.defs) {
      // Try to match last N events in order of pattern
      const needed = d.pattern.length;
      const recent = this.events.slice(-needed);
      if (recent.length < needed) continue;
      const names = recent.map((r) => r.g);
      if (arraysEqual(names, d.pattern) && recent[recent.length - 1].t - recent[0].t <= d.windowMs) {
        return d.id;
      }
    }
    return null;
  }

  /**
   * Expose current history size for testing and diagnostics.
   */
  getEventCount(): number {
    return this.events.length;
  }
}

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

