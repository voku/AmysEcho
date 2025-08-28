export interface CrashReport {
  id: string;
  name: string;
  message: string;
  stack?: string;
  timestamp: number;
  extra?: Record<string, unknown>;
}