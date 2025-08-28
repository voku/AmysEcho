export interface SequenceDefinition {
  id: string;
  pattern: string[]; // e.g., ['more', 'please']
  windowMs: number; // max time window to match whole sequence
}