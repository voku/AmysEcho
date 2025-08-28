export interface HealthResult {
  successRate: number; // 0..1
  count: number;
}

export interface HistoricalHealthEntry {
  date: string; // YYYY-MM-DD
  successRate: number;
  count: number;
}