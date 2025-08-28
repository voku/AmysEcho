export type ValidationIssue =
  | 'too_few_frames'
  | 'insufficient_motion'
  | 'landmarks_missing'
  | 'values_out_of_range';

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  suggestions: string[];
}