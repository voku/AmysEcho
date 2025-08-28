import { SequenceDefinition } from '../types';

export class SequenceRecognizer {
  private events: { g: string; t: number }[] = [];
  constructor(private defs: SequenceDefinition[]) {}

  push(gesture: string, timestamp: number = Date.now()): string | null {
    // Add event and prune > max window
    this.events.push({ g: gesture, t: timestamp });
    const maxWindow = this.defs.reduce((m, d) => Math.max(m, d.windowMs), 0);
    const cutoff = timestamp - maxWindow;
    this.events = this.events.filter((e) => e.t >= cutoff);

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
}

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

